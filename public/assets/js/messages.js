document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('messageComposeForm');
  const receiverSelect = document.getElementById('messageReceiver');
  const subjectInput = document.getElementById('messageSubject');
  const bodyInput = document.getElementById('messageBody');
  const composeCard = document.getElementById('messageComposeCard');

  if (!form || !receiverSelect) return;

  function setReceiver(receiverId, receiverName) {
    if (!receiverId) return false;
    const id = String(receiverId);
    let option = Array.from(receiverSelect.options).find((opt) => opt.value === id);
    if (!option && receiverName) {
      option = document.createElement('option');
      option.value = id;
      option.textContent = receiverName;
      receiverSelect.appendChild(option);
    }
    receiverSelect.value = id;
    receiverSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return receiverSelect.value === id;
  }

  function handleReplyClick(btn) {
    const receiverId = btn.getAttribute('data-receiver-id');
    const receiverName = btn.getAttribute('data-receiver-name') || '';
    const subject = btn.getAttribute('data-subject') || '';

    setReceiver(receiverId, receiverName);

    if (subjectInput) {
      const base = subject.replace(/^Re:\s*/i, '').trim();
      subjectInput.value = base ? `Re: ${base}` : 'Re:';
    }

    if (composeCard) {
      composeCard.classList.add('message-compose-highlight');
      composeCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () {
        composeCard.classList.remove('message-compose-highlight');
      }, 1600);
    }

    receiverSelect.focus();
    if (bodyInput) {
      bodyInput.focus();
    }
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.message-reply-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    handleReplyClick(btn);
  });
});
