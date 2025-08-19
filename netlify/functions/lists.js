// netlify/functions/lists.js
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  };

  try {
    const qs = event.queryStringParameters || {};
    const judetParam = (qs.judet || '').toLowerCase();

    const services = [
      'Curățenie',
      'Instalator',
      'Electrician',
      'Bone',
      'Electrocasnice',
      'Transport',
      'Mecanic',
    ];

    const judete = [
      'Alba','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani','Brașov','Brăila',
      'București','Buzău','Caraș-Severin','Călărași','Cluj','Constanța','Covasna','Dâmbovița',
      'Dolj','Galați','Giurgiu','Gorj','Harghita','Hunedoara','Ialomița','Iași','Ilfov',
      'Maramureș','Mehedinți','Mureș','Neamț','Olt','Prahova','Satu Mare','Sălaj','Sibiu',
      'Suceava','Teleorman','Timiș','Tulcea','Vaslui','Vâlcea','Vrancea'
    ];

    // Dacă se cere ?judet=..., răspundem cu orașele acelui județ
    if (judetParam) {
      // minim pentru demo – adaugă/completează cum dorești
      const oraseByJudet = {
        'cluj': ['Cluj-Napoca','Turda','Dej','Gherla','Câmpia Turzii'],
        'bucurești': ['Sector 1','Sector 2','Sector 3','Sector 4','Sector 5','Sector 6'],
        'bucuresti': ['Sector 1','Sector 2','Sector 3','Sector 4','Sector 5','Sector 6'],
        'timiș': ['Timișoara','Lugoj','Sânnicolau Mare','Jimbolia'],
        'timis': ['Timișoara','Lugoj','Sânnicolau Mare','Jimbolia'],
      };
      const orase = oraseByJudet[judetParam] || [];
      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // Altfel, listele de bază
    return { statusCode: 200, headers, body: JSON.stringify({ services, judete }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
