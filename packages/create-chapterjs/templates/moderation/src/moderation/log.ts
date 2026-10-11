import { AuditLogEvent, event } from 'chapterjs';

// Every moderation action, whoever did it and however (a command of this
// bot, another bot, the Discord app), reaches the audit log of the server.
// This posts the ones below in the channel named mod-log. Discord only
// sends the audit log to a bot with the View Audit Log permission.
const ACTIONS: Partial<Record<number, string>> = {
  [AuditLogEvent.MemberKick]: 'kicked',
  [AuditLogEvent.MemberBanAdd]: 'banned',
  [AuditLogEvent.MemberBanRemove]: 'unbanned',
  [AuditLogEvent.MemberUpdate]: 'updated (timeout, nickname...)',
  [AuditLogEvent.MessageBulkDelete]: 'purged messages in',
  [AuditLogEvent.ChannelOverwriteUpdate]: 'changed the permissions of',
  [AuditLogEvent.ChannelOverwriteCreate]: 'changed the permissions of',
  [AuditLogEvent.ChannelOverwriteDelete]: 'changed the permissions of',
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
    const who = `<@${entry.userId}>`;
    const target = entry.targetId
      ? guild.channels.has(entry.targetId)
        ? `<#${entry.targetId}>`
        : `<@${entry.targetId}>`
      : 'something';
    await log.send(
      `🛡️ ${who} ${action} ${target}${entry.reason ? `: ${entry.reason}` : ''}`
    );
  },
});
