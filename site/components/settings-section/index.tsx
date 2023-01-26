import {
  ChevronDownIcon,
  InfoCircledIcon,
  PlusIcon,
} from '@radix-ui/react-icons';
import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';

import { IconButton } from '@app/components/button';
import { styled } from '@app/styles';

import { Box } from '../box';
import { Tooltip } from '../tooltip';

const StyledSettingSectionHeader = styled(motion.div, {
  display: 'flex',
  position: 'relative',
  alignItems: 'center',
  cursor: 'pointer',
  background: '#fff',
  mt: '2px',
  mb: '1px',

  '> header': {
    flex: 1,

    display: 'flex',
    '> span': {
      mb: '-$1',
      color: '$grayA12',
      fontSize: '$2',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
    },
  },
});

const StyledSettingSection = styled('div', {
  display: 'flex',
  px: '$4',
  py: '$4',
  flexDirection: 'column',
  borderBottom: '1px solid $grayA5',
  '&:last-child': {
    borderBottomColor: 'transparent',
  },
});

type SettingSectionProps = {
  title: string;
  info?: string;
  onAdd?: () => void;
  children?: React.ReactNode;
  collapsedOnInitial?: boolean;
};

export const SettingSection = (props: SettingSectionProps) => {
  const [isOpen, setIsOpen] = React.useState(
    props.collapsedOnInitial !== undefined ? !props.collapsedOnInitial : false
  );

  return (
    <StyledSettingSection className="setting-section">
      <StyledSettingSectionHeader
        initial={false}
        animate={{ paddingBottom: isOpen ? '10px' : 0 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <header>
          <span>
            {props.title}
            {props.info && (
              <Tooltip content={props.info}>
                <Box css={{ ml: '$2', opacity: '0.7' }}>
                  <InfoCircledIcon width={12} height={12} />
                </Box>
              </Tooltip>
            )}
          </span>

          <IconButton transparent css={{ ml: '$2' }}>
            <ChevronDownIcon />
          </IconButton>
        </header>

        {props.onAdd && (
          <IconButton
            transparent
            onClick={(e) => {
              if (!props.onAdd) {
                return;
              }

              setIsOpen(true);
              e.stopPropagation();

              props.onAdd();
            }}
          >
            <PlusIcon />
          </IconButton>
        )}
      </StyledSettingSectionHeader>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.section
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: 'auto' },
              collapsed: { opacity: 0, height: 0 },
            }}
            transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            {props.children}
          </motion.section>
        )}
      </AnimatePresence>
    </StyledSettingSection>
  );
};

SettingSection.toString = () => '.setting-section';
