"use strict";

const SHELL_OPERATORS = new Set([";", "&&", "||", "|", "&", "(", ")"]);
const MUTATING_BRANCH_OPTIONS = new Set([
  "-d", "-D", "-m", "-M", "-c", "-C",
  "--delete", "--move", "--copy", "--edit-description",
  "--set-upstream-to", "--unset-upstream",
]);
const BRANCH_OPTIONS_WITH_VALUES = new Set([
  "--contains", "--no-contains", "--merged", "--no-merged", "--points-at",
  "--format", "--sort", "--color", "--column", "--abbrev",
]);
const READ_ONLY_BRANCH_OPTIONS = new Set([
  "-a", "-r", "-l", "-f", "-v", "-vv", "--all", "--remotes", "--list",
  "--show-current", "--verbose", "--quiet", "-q", "--ignore-case", "-i",
  "--omit-empty", "--no-column", "--no-color", "--no-abbrev",
]);

function tokenizeShell(command) {
  const tokens = [];
  let token = "";
  let quote = null;

  const push = () => {
    if (token.length > 0) tokens.push(token);
    token = "";
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && i + 1 < command.length) {
        token += command[++i];
      } else {
        token += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "\\" && i + 1 < command.length) {
      token += command[++i];
      continue;
    }
    if (char === "#" && token.length === 0) {
      while (i + 1 < command.length && command[i + 1] !== "\n") i += 1;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      if (char === "\n") tokens.push(";");
      continue;
    }
    if (";&|()".includes(char)) {
      push();
      const pair = command.slice(i, i + 2);
      if (pair === "&&" || pair === "||") {
        tokens.push(pair);
        i += 1;
      } else {
        tokens.push(char);
      }
      continue;
    }
    token += char;
  }
  push();
  return tokens;
}

function commandSegments(command) {
  const segments = [];
  let segment = [];
  for (const token of tokenizeShell(command)) {
    if (SHELL_OPERATORS.has(token)) {
      if (segment.length > 0) segments.push(segment);
      segment = [];
    } else {
      segment.push(token);
    }
  }
  if (segment.length > 0) segments.push(segment);
  return segments;
}

function skipCommandWrappers(tokens) {
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;

  if (tokens[index] === "command") {
    index += 1;
    while (tokens[index]?.startsWith("-") && tokens[index] !== "--") index += 1;
    if (tokens[index] === "--") index += 1;
  }

  if (tokens[index] === "env") {
    index += 1;
    while (index < tokens.length) {
      if (tokens[index] === "--") {
        index += 1;
        break;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
        index += 1;
        continue;
      }
      if (tokens[index] === "-u" || tokens[index] === "--unset") {
        index += 2;
        continue;
      }
      if (tokens[index].startsWith("-")) {
        index += 1;
        continue;
      }
      break;
    }
  }
  return index;
}

function gitSubcommand(tokens, gitIndex) {
  let index = gitIndex + 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "--") return { name: tokens[index + 1], args: tokens.slice(index + 2) };
    if (!token.startsWith("-")) return { name: token, args: tokens.slice(index + 1) };

    if (token === "-C" || token === "-c" || token === "--git-dir" ||
        token === "--work-tree" || token === "--namespace" || token === "--config-env" ||
        token === "--exec-path") {
      index += 2;
    } else {
      index += 1;
    }
  }
  return {};
}

function mutatingBranch(args) {
  let hasOperand = false;
  let listMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const option = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;

    if (MUTATING_BRANCH_OPTIONS.has(option)) return true;
    if (option === "--list" || option === "-l") listMode = true;
    if (BRANCH_OPTIONS_WITH_VALUES.has(option)) {
      if (!token.includes("=")) index += 1;
      continue;
    }
    if (READ_ONLY_BRANCH_OPTIONS.has(option) || /^-[arvqlif]+$/.test(token)) continue;
    if (token === "--") {
      hasOperand = hasOperand || index + 1 < args.length;
      break;
    }
    if (!token.startsWith("-")) hasOperand = true;
  }
  return hasOperand && !listMode;
}

function blockedGitOperation(command) {
  for (const tokens of commandSegments(command)) {
    const gitIndex = skipCommandWrappers(tokens);
    const executable = tokens[gitIndex]?.split("/").pop();
    if (executable !== "git") continue;

    const subcommand = gitSubcommand(tokens, gitIndex);
    if (["switch", "checkout", "worktree"].includes(subcommand.name)) return subcommand.name;
    if (subcommand.name === "branch" && mutatingBranch(subcommand.args ?? [])) return "branch";
  }
  return null;
}

module.exports = { blockedGitOperation };
