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

  let sections = [];
  try {
    const resp = await fetch('/data/sections.json');
    sections = await resp.json();
  } catch (e) {
    console.error('Failed to load sections data:', e);
  }

  let stateLayer = null;
  let statesGeoJSON = null;
  try {
    const resp = await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
    statesGeoJSON = await resp.json();
  } catch (e) {
    console.error('Failed to load states GeoJSON:', e);
  }

  const markersLayer = L.layerGroup().addTo(map);

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

  async function refresh() {
    try {
      const resp = await fetch('/contacts/api/all');
      const allContacts = await resp.json();
      const { contactedSections, sectionCounts, contactedStates } = buildContactData(allContacts);
      updateMap(contactedSections, sectionCounts, contactedStates);
    } catch (e) {
      console.error('Map update failed:', e);
    }
  }

  await refresh();
  setInterval(refresh, 5000);
});
