document.addEventListener('DOMContentLoaded', async () => {
  const map = L.map('map').setView([39.8, -98.6], 4);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  }).addTo(map);

  const stateNameToAbbr = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
    'Puerto Rico': 'PR'
  };

  // Load sections
  let sections = [];
  try {
    const resp = await fetch('/data/sections.json');
    sections = await resp.json();
  } catch (e) {
    console.error('Failed to load sections data:', e);
  }

  // State layers for live re-styling
  let stateLayer = null;
  let statesGeoJSON = null;
  try {
    const resp = await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
    statesGeoJSON = await resp.json();
  } catch (e) {
    console.error('Failed to load states GeoJSON:', e);
  }

  // Section markers layer group for easy clearing
  const markersLayer = L.layerGroup().addTo(map);

  // Tracking state
  let lastContactCount = 0;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function buildContactData(contacts) {
    const contactedSections = new Set(contacts.map(c => c.section));
    const sectionCounts = {};
    contacts.forEach(c => {
      sectionCounts[c.section] = (sectionCounts[c.section] || 0) + 1;
    });
    const contactedStates = new Set();
    sections.forEach(s => {
      if (contactedSections.has(s.code) && s.country === 'US') {
        contactedStates.add(s.state);
      }
    });
    return { contactedSections, sectionCounts, contactedStates };
  }

  function updateMap(contactedSections, sectionCounts, contactedStates) {
    // Re-draw state layer
    if (stateLayer) map.removeLayer(stateLayer);
    if (statesGeoJSON) {
      stateLayer = L.geoJSON(statesGeoJSON, {
        style: (feature) => {
          const abbr = stateNameToAbbr[feature.properties.name];
          const isContacted = contactedStates.has(abbr);
          return {
            fillColor: isContacted ? '#4f46e5' : '#e5e7eb',
            weight: 1,
            opacity: 1,
            color: '#9ca3af',
            fillOpacity: isContacted ? 0.35 : 0.08
          };
        },
        onEachFeature: (feature, layer) => {
          const abbr = stateNameToAbbr[feature.properties.name];
          const stateSections = sections.filter(s => s.state === abbr);
          const contactedInState = stateSections.filter(s => contactedSections.has(s.code));
          let tooltip = '<strong>' + feature.properties.name + '</strong>';
          if (contactedInState.length > 0) {
            tooltip += '<br>Sections worked: ' + contactedInState.map(s => s.code).join(', ');
          } else {
            const allSects = stateSections.map(s => s.code).join(', ');
            if (allSects) tooltip += '<br>Sections: ' + allSects;
          }
          layer.bindTooltip(tooltip);
        }
      }).addTo(map);
    }

    // Re-draw section markers
    markersLayer.clearLayers();
    sections.forEach(section => {
      if (contactedSections.has(section.code)) {
        const count = sectionCounts[section.code] || 0;
        const marker = L.circleMarker([section.lat, section.lng], {
          radius: Math.min(6 + count * 0.5, 15),
          fillColor: '#4f46e5',
          color: '#312e81',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        });
        marker.bindPopup(
          '<strong>' + section.code + '</strong> - ' + section.name +
          '<br>' + count + ' QSO(s)'
        );
        markersLayer.addLayer(marker);
      }
    });
  }

  function updateStats(stats) {
    document.getElementById('statQsos').textContent = stats.total_qsos;
    document.getElementById('statCalls').textContent = stats.unique_calls;
    document.getElementById('statSections').textContent = stats.unique_sections;
  }

  function updateRecentTable(recentContacts) {
    const tbody = document.getElementById('recentBody');
    if (!tbody) return;

    if (recentContacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="px-3 py-8 text-center text-sm text-gray-500">No contacts logged yet. Go to a station to start logging!</td></tr>';
      return;
    }

    tbody.innerHTML = recentContacts.map(contact => {
      const time = new Date(contact.created_at).toISOString().slice(11, 16);
      return '<tr>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(time) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.station_name) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">' + escapeHtml(contact.callsign) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.class) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.section) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500"><span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">' + escapeHtml(contact.band) + '</span></td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500"><span class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-700/10">' + escapeHtml(contact.mode) + '</span></td>' +
        '<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">' + escapeHtml(contact.operator) + '</td>' +
        '</tr>';
    }).join('');
  }

  function updateScoreboard(scoreboard) {
    const tbody = document.getElementById('scoreboardBody');
    if (!tbody) return;

    if (!scoreboard || scoreboard.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="px-3 py-8 text-center text-sm text-gray-500">No contacts logged yet.</td></tr>';
      return;
    }

    tbody.innerHTML = scoreboard.map((row, i) => {
      return '<tr>' +
        '<td class="whitespace-nowrap px-3 py-3 text-sm text-gray-500">' + (i + 1) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">' + escapeHtml(row.operator) + '</td>' +
        '<td class="whitespace-nowrap px-3 py-3 text-sm text-right font-semibold text-indigo-600">' + escapeHtml(String(row.contact_count)) + '</td>' +
        '</tr>';
    }).join('');
  }

  async function refresh() {
    try {
      const [dashResp, allResp] = await Promise.all([
        fetch('/contacts/api/dashboard'),
        fetch('/contacts/api/all')
      ]);
      const dashData = await dashResp.json();
      const allContacts = await allResp.json();

      updateStats(dashData.stats);
      updateRecentTable(dashData.recentContacts);
      updateScoreboard(dashData.scoreboard);

      const { contactedSections, sectionCounts, contactedStates } = buildContactData(allContacts);
      updateMap(contactedSections, sectionCounts, contactedStates);

      lastContactCount = allContacts.length;
    } catch (e) {
      console.error('Live update failed:', e);
    }
  }

  // Initial render
  await refresh();

  // Poll every 5 seconds
  setInterval(refresh, 5000);
});
