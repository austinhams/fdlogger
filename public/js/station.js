function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load sections for autocomplete
  let sections = [];
  try {
    const resp = await fetch('/data/sections.json');
    sections = await resp.json();
  } catch (e) {
    console.error('Failed to load sections:', e);
  }

  // Track existing callsigns for dupe check
  const loggedCallsigns = new Set(
    (typeof existingCallsigns !== 'undefined' ? existingCallsigns : [])
      .map(c => c.toUpperCase())
  );

  // Section autocomplete
  const sectionInput = document.getElementById('section');
  const suggestionsDiv = document.getElementById('sectionSuggestions');

  if (sectionInput && suggestionsDiv) {
    sectionInput.addEventListener('input', () => {
      const val = sectionInput.value.toUpperCase();
      if (val.length === 0) {
        suggestionsDiv.classList.add('hidden');
        return;
      }

      const matches = sections.filter(s =>
        s.code.startsWith(val) || s.name.toUpperCase().includes(val)
      ).slice(0, 10);

      if (matches.length === 0) {
        suggestionsDiv.classList.add('hidden');
        return;
      }

      suggestionsDiv.innerHTML = matches.map(s =>
        '<div class="cursor-pointer px-3 py-2 hover:bg-indigo-50 text-sm" data-code="' + escapeHtml(s.code) + '">' +
        '<span class="font-medium">' + escapeHtml(s.code) + '</span> - ' + escapeHtml(s.name) +
        '</div>'
      ).join('');
      suggestionsDiv.classList.remove('hidden');

      suggestionsDiv.querySelectorAll('[data-code]').forEach(el => {
        el.addEventListener('click', () => {
          sectionInput.value = el.dataset.code;
          suggestionsDiv.classList.add('hidden');
        });
      });
    });

    document.addEventListener('click', (e) => {
      if (!sectionInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
        suggestionsDiv.classList.add('hidden');
      }
    });
  }

  // Dupe check on callsign input
  const callsignInput = document.getElementById('callsign');
  const dupeWarning = document.getElementById('dupeWarning');

  if (callsignInput && dupeWarning) {
    callsignInput.addEventListener('input', () => {
      const val = callsignInput.value.toUpperCase().trim();
      if (val && loggedCallsigns.has(val)) {
        dupeWarning.classList.remove('hidden');
      } else {
        dupeWarning.classList.add('hidden');
      }
    });
  }

  // Focus callsign input on page load
  if (callsignInput) {
    callsignInput.focus();
  }

  // Handle form submission with AJAX for faster logging
  const logForm = document.getElementById('logForm');
  if (logForm) {
    logForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(logForm);
      const data = Object.fromEntries(formData);

      try {
        const resp = await fetch('/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          const err = await resp.json();
          alert(err.error || 'Failed to log contact');
          return;
        }

        const contact = await resp.json();

        // Track for dupe checking
        loggedCallsigns.add(contact.callsign.toUpperCase());

        // Add to table
        const tbody = document.getElementById('contactsBody');
        const noRow = document.getElementById('noContactsRow');
        if (noRow) noRow.remove();

        const countSpan = document.getElementById('contactCount');
        const currentCount = parseInt(countSpan.textContent) + 1;
        countSpan.textContent = currentCount;

        const time = new Date(contact.created_at).toISOString().slice(11, 16);
        const row = document.createElement('tr');
        row.innerHTML =
          '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + currentCount + '</td>' +
          '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(time) + '</td>' +
          '<td class="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">' + escapeHtml(contact.callsign) + '</td>' +
          '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.class) + '</td>' +
          '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.section) + '</td>' +
          '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.operator) + '</td>' +
          '<td class="whitespace-nowrap px-3 py-4 text-sm">' +
            '<form action="/contacts/' + contact.id + '/delete" method="POST" class="inline" onsubmit="return confirm(\'Delete this contact?\')">' +
              '<button type="submit" class="text-red-600 hover:text-red-900 text-sm">Delete</button>' +
            '</form>' +
          '</td>';

        tbody.insertBefore(row, tbody.firstChild);

        // Clear form and refocus
        logForm.reset();
        document.querySelector('input[name="station_id"]').value = data.station_id;
        callsignInput.focus();
        dupeWarning.classList.add('hidden');

        // Flash success
        row.classList.add('bg-green-50');
        setTimeout(() => row.classList.remove('bg-green-50'), 1500);

      } catch (err) {
        console.error('Failed to log contact:', err);
        alert('Failed to log contact. Please try again.');
      }
    });
  }
});
