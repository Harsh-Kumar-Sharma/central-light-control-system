// Sunrise / sunset (US Naval Observatory "Almanac for Computers" algorithm,
// official zenith 90.833 deg). Good to about a minute or two, which is plenty
// for switching street lights.
const RAD = Math.PI / 180;
const norm = (x, n) => ((x % n) + n) % n;

function dayOfYear(y, m, d) {
  const n1 = Math.floor((275 * m) / 9);
  const n2 = Math.floor((m + 9) / 12);
  const n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
  return n1 - n2 * n3 + d - 30;
}

// UT hour (0-24) of the event on calendar date y-m-d, or null when the sun
// does not rise / set that day (polar regions).
function eventHourUT(y, m, d, lat, lon, rising) {
  const lngHour = lon / 15;
  const t = dayOfYear(y, m, d) + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = norm(M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634, 360);
  let RA = norm(Math.atan(0.91764 * Math.tan(L * RAD)) / RAD, 360);
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return norm(T - lngHour, 24);
}

// Returns { sunrise: Date|null, sunset: Date|null } as UTC instants for the
// UTC calendar day y-m-d. The caller picks the day that matches its local date.
export function sunTimesUtc(y, m, d, lat, lon) {
  const at = (h) => (h == null ? null : new Date(Date.UTC(y, m - 1, d) + h * 3600_000));
  return {
    sunrise: at(eventHourUT(y, m, d, lat, lon, true)),
    sunset: at(eventHourUT(y, m, d, lat, lon, false)),
  };
}
