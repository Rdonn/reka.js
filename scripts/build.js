const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const args = [];
let rollup = "../../rollup.config.js";

process.argv.slice(2).forEach((arg) => {
  switch (arg) {
    case "-w":
      args.push("-w");
      break;
    default:
      console.error("Invalid option");
      process.exit(1);
  }
});

if (fs.existsSync(path.join(__dirname, "rollup.config.js"))) {
  rollup = "rollup.config.js";
}

const tscProcess = spawn("pnpm", ["tsc", "--skipLibCheck", "--emitDeclarationOnly", ...args]);
const rollupProcess = spawn("pnpm", ["rollup", "-c", rollup, ...args]);

tscProcess.stdout.on("data", (data) => console.log(data.toString()));
tscProcess.stderr.on("data", (data) => console.error(data.toString()));
tscProcess.on("error", (err) => console.error(err));
tscProcess.on("close", (code) => {
  if (code !== 0) {
    console.error(`tsc exited with code ${code}`);
    process.exit(1);
  }
});

rollupProcess.stdout.on("data", (data) => console.log(data.toString()));
rollupProcess.stderr.on("data", (data) => console.error(data.toString()));
rollupProcess.on("error", (err) => console.error(err));
rollupProcess.on("close", (code) => {
  if (code !== 0) {
    console.error(`rollup exited with code ${code}`);
    process.exit(1);
  }
});
