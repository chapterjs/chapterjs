import { AuditLogEvent, event } from 'chapterjs';

// Every moderation action reaches the audit log of the server, whoever did
// it and however: a command of this bot, another bot, the Discord app. This
// posts the ones below in the channel named mod-log, when there is one.
// Discord only sends the audit log to a bot with View Audit Log.
const ACTIONS: Partial<Record<number, string>> = {
  [AuditLogEvent.MemberKick]: '👢 kicked',
  [AuditLogEvent.MemberBanAdd]: '🔨 banned',
  [AuditLogEvent.MemberBanRemove]: '🕊️ unbanned',
  [AuditLogEvent.MemberUpdate]: '✏️ updated',
  [AuditLogEvent.MessageBulkDelete]: '🧹 purged messages in',
  [AuditLogEvent.ChannelOverwriteCreate]: '🔒 changed the permissions of',
  [AuditLogEvent.ChannelOverwriteUpdate]: '🔒 changed the permissions of',
  [AuditLogEvent.ChannelOverwriteDelete]: '🔓 changed the permissions of',
};

export default event({
  name: 'auditLogEntryCreate',
  async run({ entry, guild }) {
    const action = ACTIONS[entry.actionType];
    if (!action || !entry.userId) return;
    const log = [...guild.channels.values()].find(
      channel => channel.isText() && channel.name === 'mod-log'
    );
    if (!log?.isText()) return;
    const target = !entry.targetId
      ? 'something'
      : guild.channels.has(entry.targetId)
        ? `<#${entry.targetId}>`
        : `<@${entry.targetId}>`;
    await log.send({
      content: `<@${entry.userId}> ${action} ${target}${entry.reason ? `: ${entry.reason}` : ''}`,
      // The log names people without pinging them.
      allowedMentions: { parse: [] },
    });
  },
});
