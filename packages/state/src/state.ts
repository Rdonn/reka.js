import * as t from '@composite/types';
import {
  computed,
  IComputedValue,
  makeObservable,
  observable,
  reaction,
} from 'mobx';
import { Environment } from './environment';
import { computeExpression } from './expression';
import { ExtensionDefinition, ExtensionRegistry } from './extension';
import { Frame, FrameOpts } from './frame';
import { Observer } from './observer';
import { Query } from './query';
import { Resolver } from './resolver';

type StateOpts = {
  data: t.Program;
  components?: t.Component[];
  globals?: Record<string, any>;

  extensions?: ExtensionDefinition<any>[];
};

type StateConfig = {
  globals: Record<string, any>;
  components?: t.Component[];
};

export type StateSubscriberOpts = {
  fireImmediately?: boolean;
};

type StateSubscriber<C> = {
  collect: (query: Query) => C;
  onCollect: (collected: C, prevCollected: C) => void;
  opts: StateSubscriberOpts;
};

export class State {
  env: Environment;
  resolver: Resolver;
  frames: Frame[];
  data: t.State;

  query: Query;

  private observer: Observer<t.State>;
  private syncGlobals: IComputedValue<void> | null = null;
  private syncComponents: IComputedValue<void> | null = null;
  private syncCleanupEnv: IComputedValue<void> | null = null;

  private extensionRegistry: ExtensionRegistry;
  private idToFrame: Map<string, Frame> = new Map();
  private subscribers: Set<StateSubscriber<any>> = new Set();
  private subscriberDisposers: WeakMap<any, any> = new WeakMap();

  constructor(private readonly opts: StateOpts) {
    this.data = t.state({
      program: opts.data,
      extensions: {},
    });

    this.query = new Query(this);

    this.observer = new Observer(this.data, this.observerConfig);
    this.env = new Environment(this);
    this.resolver = new Resolver(this);
    this.frames = [];

    makeObservable(this, {
      config: computed,
      data: observable,
      allComponents: computed,
    });

    this.extensionRegistry = new ExtensionRegistry(
      this,
      this.opts.extensions ?? []
    );

    this.extensionRegistry.init();

    this.sync();
  }

  getExtensionState<E extends ExtensionDefinition<any>>(extension: E) {
    const value = this.extensionRegistry.getExtensionStateValue(extension);

    if (!value) {
      throw new Error();
    }

    return value as E['state'];
  }

  get config(): StateConfig {
    const config = {
      globals: this.opts.globals || {},
      components: this.opts.components || [],
    };

    this.extensionRegistry.extensions.forEach((extension) => {
      Object.assign(config.globals, extension.definition.globals);
      config.components.push(...extension.definition.components);
    });

    return config;
  }

  get root() {
    return this.data.program;
  }

  private get observerConfig() {
    return {
      hooks: {
        onDispose: (payload) => {
          if (payload.type instanceof t.Identifier) {
            this.resolver.identifiersToVariableDistance.delete(payload.type);
          }
        },
      },
    };
  }

  get allComponents() {
    return [...(this.config.components ?? []), ...this.root.components];
  }

  sync() {
    this.resolver.resolveProgram();

    if (!this.syncGlobals) {
      this.syncGlobals = computed(() => {
        Object.entries(this.config.globals).forEach(([key, value]) => {
          this.env.set(key, value);
        });

        this.root.globals.forEach((global) => {
          this.env.set(
            global.name,
            computeExpression(global.init, this as any, this.env)
          );
        });
      });
    }

    if (!this.syncComponents) {
      this.syncComponents = computed(() => {
        this.allComponents.forEach((component) => {
          this.env.set(component.name, component);
        });
      });
    }

    if (!this.syncCleanupEnv) {
      this.syncCleanupEnv = computed(() => {
        const globalVarNames = [
          ...Object.keys(this.config.globals),
          this.root.globals.map((global) => global.name),
        ];
        const componentNames = this.allComponents.map(
          (component) => component.name
        );

        const envBindingNames = [...globalVarNames, ...componentNames];

        for (const key of this.env.bindings.keys()) {
          if (envBindingNames.indexOf(key) > -1) {
            continue;
          }

          this.env.delete(key);
        }
      });
    }

    this.syncGlobals.get();
    this.syncComponents.get();
    this.syncCleanupEnv.get();

    this.frames.forEach((frame) => {
      frame.render();
    });
  }

  change(mutator: () => void) {
    this.observer.change(() => {
      mutator();
    });

    this.sync();
  }

  createFrame(opts: FrameOpts) {
    const frame = new Frame(opts, this);

    if (opts.id) {
      this.idToFrame.set(opts.id, frame);
    }

    this.frames.push(frame);

    frame.render();

    return frame;
  }

  removeFrame(frame: Frame) {
    this.frames.splice(this.frames.indexOf(frame), 1);

    if (!frame.id) {
      return;
    }

    this.idToFrame.delete(frame.id);
  }

  getFrameById(id: string) {
    return this.idToFrame.get(id);
  }

  replace(state: t.State) {
    const oldSubscribers = new Set(this.subscribers);

    this.subscribers.forEach((subscriber) => {
      if (!this.subscriberDisposers.get(subscriber)) {
        return;
      }

      this.subscriberDisposers.get(subscriber)();
    });

    this.subscribers = new Set();

    this.data = state;
    this.observer.replace(this.data);

    this.env = new Environment(this);
    this.resolver = new Resolver(this);
    this.frames = [];

    this.syncComponents = null;
    this.syncGlobals = null;
    this.syncCleanupEnv = null;

    this.extensionRegistry.replace();

    this.frames.forEach((frame) => frame.hardRerender());

    oldSubscribers.forEach((subscriber) =>
      this.subscribe(subscriber.collect, subscriber.onCollect, subscriber.opts)
    );

    this.sync();
  }

  getExtension<E extends ExtensionDefinition<any>>(definition: E) {
    return this.extensionRegistry.getExtensionFromDefinition(definition);
  }

  getTypeFromId(id: string) {
    return this.observer.idToType.get(id);
  }

  getParentType(type: t.Type) {
    return this.observer.getParent(type);
  }

  listenToChanges(...args: Parameters<Observer<any>['subscribe']>) {
    return this.observer.subscribe(...args);
  }

  subscribe2(...args: any[]) {
    // @ts-ignore
    return this.observer.subscribe2(...args);
  }

  subscribe<C>(
    collect: (query: Query) => C,
    onCollect: (collected: C, prevCollected: C) => void,
    opts?: StateSubscriberOpts
  ) {
    const subscriber: StateSubscriber<any> = {
      collect,
      onCollect,
      opts: {
        fireImmediately: false,
        ...(opts ?? {}),
      },
    };

    this.subscribers.add(subscriber);

    const disposeReaction = reaction(
      () => subscriber.collect(this.query),
      (collected, prevCollected) => {
        subscriber.onCollect(collected, prevCollected);
      },
      {
        fireImmediately: subscriber.opts.fireImmediately,
      }
    );

    const dispose = () => {
      disposeReaction();
      this.subscribers.delete(subscriber);
    };

    this.subscriberDisposers.set(subscriber, dispose);

    return dispose;
  }

  dispose() {
    this.observer.dispose();
  }

  toJSON() {
    return this.data;
  }
}
