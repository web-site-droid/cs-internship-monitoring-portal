function normalizeMessageSubject(subject) {
  let normalized = (subject || 'No subject').trim();
  while (/^Re:\s*/i.test(normalized)) {
    normalized = normalized.replace(/^Re:\s*/i, '').trim();
  }
  return normalized || 'No subject';
}

function groupMessagesIntoThreads(userId, messages) {
  const currentUserId = Number(userId);
  const threadMap = new Map();

  for (const msg of messages || []) {
    const senderId = Number(msg.sender_id);
    const receiverId = Number(msg.receiver_id);
    const contactId = senderId === currentUserId ? receiverId : senderId;
    const contactName = senderId === currentUserId ? msg.receiver_name : msg.sender_name;
    const rootSubject = normalizeMessageSubject(msg.subject);
    const key = `${contactId}::${rootSubject.toLowerCase()}`;

    if (!threadMap.has(key)) {
      threadMap.set(key, {
        contactId,
        contactName,
        rootSubject,
        messages: [],
      });
    }

    threadMap.get(key).messages.push(msg);
  }

  return Array.from(threadMap.values())
    .map((thread) => {
      thread.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const latest = thread.messages[thread.messages.length - 1];
      const latestBody = (latest.message || '').replace(/\s+/g, ' ').trim();
      return {
        contactId: thread.contactId,
        contactName: thread.contactName,
        rootSubject: thread.rootSubject,
        messages: thread.messages,
        messageCount: thread.messages.length,
        hasUnread: thread.messages.some(
          (m) => Number(m.receiver_id) === currentUserId && !Number(m.is_read)
        ),
        latest,
        latestPreview: latestBody.length > 72 ? `${latestBody.slice(0, 72)}…` : latestBody,
      };
    })
    .sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
}

module.exports = {
  normalizeMessageSubject,
  groupMessagesIntoThreads,
};
