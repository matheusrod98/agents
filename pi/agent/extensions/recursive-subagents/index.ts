import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { AgentTree, MESSAGE_TYPE } from "./runtime.ts";
import { TreeDisplay } from "./display.ts";
import { CHILD_IDENTITY_EVENT } from "./child-resources.ts";

export default function (pi: ExtensionAPI) {
  const identity = { child: false };
  pi.events.emit(CHILD_IDENTITY_EVENT, identity);
  if (identity.child) return; // SDK tools belong to the existing tree, never another coordinator.
  let context: ExtensionContext;
  let tree: AgentTree | undefined;
  let display: TreeDisplay | undefined;

  const current = () => {
    if (!tree) throw new Error("The subagent runtime is not active.");
    return tree;
  };

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    display = new TreeDisplay(pi, () => context);
    tree = new AgentTree({
      context: () => context,
      send: (content, details, triggerTurn) =>
        pi.sendMessage(
          { customType: MESSAGE_TYPE, content, display: true, details },
          { triggerTurn, deliverAs: "steer" },
        ),
      record: (data) => pi.appendEntry(MESSAGE_TYPE, data),
      changed: (snapshot) => {
        display?.update(snapshot);
        const children = snapshot.agents.filter(
          (agent) => agent.id !== snapshot.rootId,
        );
        if (!children.length) return;
        const working = children.filter(
          (agent) =>
            agent.activity === "working" || agent.activity === "starting",
        ).length;
        const pending = snapshot.questions.filter(
          (question) => question.answer === undefined,
        ).length;
        context.ui.setStatus(
          MESSAGE_TYPE,
          `Agents: ${working}/${children.length} working${pending ? ` · ${pending} questions` : ""} · /agents`,
        );
      },
    });
    display.update(tree.snapshot());
    for (const tool of tree.tools(tree.rootId)) pi.registerTool(tool);
  });

  pi.on("before_agent_start", (event) => ({
    systemPrompt:
      event.systemPrompt +
      "\n\nDelegation uses native Pi SDK sessions. subagent spawn returns immediately; children may delegate recursively and their settled responses arrive automatically. Do not poll or wait using bash. You can continue work or finish your turn while children work. A settled response is not proof of task success. Use ask_parent for questions (at the root this asks the user); use answer_question to reply to requests addressed to you. If you escalate a child's question, relay the eventual answer with answer_question. Child sessions have native built-in tools, skills, context, and explicitly configured work extensions (including web research by default); direct user-question and parent UI extensions are replaced by ask_parent. Use /agents to open the read-only tree in one Herdr split.",
  }));
  pi.on("agent_start", (_event, ctx) => {
    context = ctx;
    tree?.rootActivity("working");
  });
  pi.on("agent_settled", (_event, ctx) => {
    context = ctx;
    if (ctx.isIdle()) tree?.rootActivity("idle");
  });
  pi.on("session_info_changed", (event) => tree?.rootName(event.name));
  pi.on("input", (event) => {
    tree?.rootMessage("input", event.text);
  });
  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    const text = event.message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    tree?.rootMessage("response", text);
    if (event.message.stopReason === "error") tree?.rootActivity("error");
    if (event.message.stopReason === "aborted")
      tree?.rootActivity("interrupted");
  });

  pi.registerCommand("agents", {
    description:
      "Open the read-only Herdr agent tree; /agents answer <question-id> reopens a dismissed user question.",
    handler: async (args, ctx) => {
      context = ctx;
      const [action, questionId] = args.trim().split(/\s+/);
      if (action === "answer") {
        if (!questionId) {
          ctx.ui.notify("Usage: /agents answer <question-id>", "error");
          return;
        }
        await current().promptUser(questionId);
      } else if (action)
        ctx.ui.notify(
          "Usage: /agents or /agents answer <question-id>",
          "error",
        );
      else {
        try {
          await display?.open();
        } catch (error) {
          ctx.ui.notify(String(error), "error");
        }
      }
    },
  });

  pi.registerMessageRenderer(
    MESSAGE_TYPE,
    (message, { expanded, outputPad }, theme) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n");
      const visible = expanded
        ? content
        : content.split("\n").slice(0, 8).join("\n");
      return new Text(
        theme.fg("accent", "↳ ") +
          visible +
          (!expanded && content.split("\n").length > 8
            ? "\n… expand for full message"
            : ""),
        outputPad,
        0,
      );
    },
  );

  pi.on("session_shutdown", async () => {
    await tree?.dispose();
    display?.dispose();
    context?.ui.setStatus(MESSAGE_TYPE, undefined);
    tree = undefined;
  });
}
