const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Haversine distance (km) ──────────────────────────────────────────────────
function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Geocode address via Nominatim ────────────────────────────────────────────
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=de`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FahrgemeinschaftApp/1.0' }
  });
  const data = await res.json();
  if (!data.length) throw new Error(`Adresse nicht gefunden: ${address}`);
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ── Routing matrix via OpenRouteService ─────────────────────────────────────
// Returns distance matrix in km for given points
async function getDistanceMatrix(points) {
  if (!process.env.ORS_API_KEY) {
    // Fallback: haversine for all pairs
    return null;
  }
  const coords = points.map(p => [p.lng, p.lat]);
  const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: {
      'Authorization': process.env.ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ locations: coords, metrics: ['distance'], units: 'km' })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.distances; // 2D array [origin][dest] in km
}

// ── Matching algorithm ───────────────────────────────────────────────────────
async function computeGroups(drivers, riders, dest) {
  // Build all relevant points for matrix call
  const allPoints = [...drivers, ...riders, dest];
  const matrix = await getDistanceMatrix(allPoints);

  function getDist(aIdx, bIdx) {
    if (matrix) return matrix[aIdx][bIdx];
    return haversine(allPoints[aIdx], allPoints[bIdx]);
  }

  const destIdx = allPoints.length - 1;

  // Greedy: assign each rider to the driver with minimum detour
  const groups = drivers.map((d, i) => ({
    driverIdx: i,
    driver: d,
    riderIdxs: [],
    seatsLeft: d.seats_available || 3
  }));

  const riderOffset = drivers.length;

  for (let ri = 0; ri < riders.length; ri++) {
    const riderGlobalIdx = riderOffset + ri;
    const need = riders[ri].seats_needed || 1;
    let best = null, bestScore = Infinity;

    for (const g of groups) {
      if (g.seatsLeft < need) continue;
      // Detour = dist(driver→rider) + dist(rider→dest) - dist(driver→dest)
      const detour =
        getDist(g.driverIdx, riderGlobalIdx) +
        getDist(riderGlobalIdx, destIdx) -
        getDist(g.driverIdx, destIdx);
      if (detour < bestScore) { bestScore = detour; best = g; }
    }

    if (best) {
      best.riderIdxs.push(ri);
      best.seatsLeft -= need;
    }
  }

  // Determine meetup point per group
  return groups.map(g => {
    const riderList = g.riderIdxs.map(i => riders[i]);
    let meetupType = 'at_driver';
    let meetupAddress = g.driver.address;
    let meetupLat = g.driver.lat;
    let meetupLng = g.driver.lng;

    if (riderList.length > 0) {
      const firstRider = riderList[0];
      const driverToRider = haversine(g.driver, firstRider);
      // If rider is close (< 500m) → rider comes to driver
      // If detour is small (< 15% of direct route) → driver picks up
      const directDist = haversine(g.driver, dest);
      const detourRatio = driverToRider / Math.max(directDist, 0.1);

      if (driverToRider < 0.5) {
        meetupType = 'at_driver';
      } else if (detourRatio < 0.15) {
        meetupType = 'at_rider';
        meetupAddress = firstRider.address;
        meetupLat = firstRider.lat;
        meetupLng = firstRider.lng;
      } else {
        meetupType = 'at_driver';
      }
    }

    return {
      driver_player_id: g.driver.id,
      rider_player_ids: riderList.map(r => r.id),
      meetup_type: meetupType,
      meetup_address: meetupAddress,
      meetup_lat: meetupLat,
      meetup_lng: meetupLng,
      seats_remaining: g.seatsLeft,
      direct_dist_km: parseFloat(haversine(g.driver, dest).toFixed(1))
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Players ──────────────────────────────────────────────────────────────────

// GET all players (admin)
app.get('/api/players', async (req, res) => {
  const { data, error } = await supabase.from('players').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST new player (admin)
app.post('/api/players', async (req, res) => {
  const { name, address, phone, has_car } = req.body;
  if (!name || !address) return res.status(400).json({ error: 'Name und Adresse erforderlich' });

  let lat, lng;
  try {
    ({ lat, lng } = await geocode(address));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const magic_token = crypto.randomUUID();
  const { data, error } = await supabase.from('players').insert({
    name, address, lat, lng, phone, has_car: !!has_car, magic_token
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE player (admin)
app.delete('/api/players/:id', async (req, res) => {
  const { error } = await supabase.from('players').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Update player ────────────────────────────────────────────────────────────
app.patch('/api/players/:id', async (req, res) => {
  const { name, address, phone, has_car, regeocode } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (has_car !== undefined) updates.has_car = has_car;
  if (address !== undefined) {
    updates.address = address;
    if (regeocode) {
      try {
        const { lat, lng } = await geocode(address);
        updates.lat = lat;
        updates.lng = lng;
      } catch(e) {
        return res.status(400).json({ error: `Adresse nicht gefunden: ${address}` });
      }
    }
  }
  const { data, error } = await supabase
    .from('players').update(updates).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Player defaults ───────────────────────────────────────────────────────────

app.get('/api/players/:id/defaults', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('default_mode, default_seats_available, default_seats_needed')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({
    mode: data.default_mode || 'pending',
    seats_available: data.default_seats_available || 2,
    seats_needed: data.default_seats_needed || 1
  });
});

app.post('/api/players/:id/defaults', async (req, res) => {
  const { default_mode, default_seats_available, default_seats_needed } = req.body;
  const { error } = await supabase
    .from('players')
    .update({ default_mode, default_seats_available, default_seats_needed })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Player by magic token (public) ───────────────────────────────────────────
app.get('/api/me/:token', async (req, res) => {
  const { data, error } = await supabase
    .from('players').select('*').eq('magic_token', req.params.token).single();
  if (error || !data) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(data);
});

// ── Games ────────────────────────────────────────────────────────────────────

app.get('/api/games', async (req, res) => {
  const { data, error } = await supabase
    .from('games').select('*').order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/games/current', async (req, res) => {
  const { data, error } = await supabase
    .from('games').select('*')
    .in('status', ['open', 'calculated', 'published'])
    .order('date').limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/games', async (req, res) => {
  const { destination_name, destination_address, date, rsvp_deadline, player_ids } = req.body;

  let dest_lat, dest_lng;
  try {
    ({ lat: dest_lat, lng: dest_lng } = await geocode(destination_address));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data: game, error } = await supabase.from('games').insert({
    destination_name, destination_address, dest_lat, dest_lng,
    date, rsvp_deadline, status: 'open'
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Insert lineup
  if (player_ids?.length) {
    const lineup = player_ids.map(pid => ({ game_id: game.id, player_id: pid }));
    await supabase.from('lineups').insert(lineup);
  }

  res.json(game);
});

app.patch('/api/games/:id', async (req, res) => {
  const { status, player_ids, destination_name, destination_address, date, rsvp_deadline } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (destination_name) updates.destination_name = destination_name;
  if (date) updates.date = date;
  if (rsvp_deadline !== undefined) updates.rsvp_deadline = rsvp_deadline;

  // Re-geocode if address changed
  if (destination_address) {
    updates.destination_address = destination_address;
    try {
      const { lat, lng } = await geocode(destination_address);
      updates.dest_lat = lat;
      updates.dest_lng = lng;
    } catch(e) {
      return res.status(400).json({ error: `Adresse nicht gefunden: ${destination_address}` });
    }
  }

  // Only run UPDATE if there's something to update
  let game;
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from('games').update(updates).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    game = data;
  } else {
    const { data, error } = await supabase
      .from('games').select('*').eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    game = data;
  }

  if (player_ids !== undefined) {
    await supabase.from('lineups').delete().eq('game_id', req.params.id);
    if (player_ids.length) {
      await supabase.from('lineups').insert(
        player_ids.map(pid => ({ game_id: req.params.id, player_id: pid }))
      );
    }
  }
  res.json(game);
});

// ── Lineup for a game ─────────────────────────────────────────────────────────
app.get('/api/games/:id/lineup', async (req, res) => {
  const { data, error } = await supabase
    .from('lineups')
    .select('players(*)')
    .eq('game_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(r => r.players));
});

// ── RSVPs ────────────────────────────────────────────────────────────────────
app.get('/api/games/:id/rsvps', async (req, res) => {
  const { data, error } = await supabase
    .from('rsvps').select('*, players(name, address)')
    .eq('game_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/games/:id/rsvps', async (req, res) => {
  const { player_id, mode, seats_available, seats_needed, note } = req.body;
  const { data, error } = await supabase.from('rsvps').upsert({
    game_id: req.params.id, player_id, mode,
    seats_available: mode === 'driving' ? (seats_available || 2) : null,
    seats_needed: mode === 'riding' ? (seats_needed || 1) : null,
    note: note || null
  }, { onConflict: 'game_id,player_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Assignments ───────────────────────────────────────────────────────────────
app.get('/api/games/:id/assignments', async (req, res) => {
  const { data, error } = await supabase
    .from('assignments').select('*').eq('game_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST: compute groups
app.post('/api/games/:id/calculate', async (req, res) => {
  const gameId = req.params.id;

  // Load game
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
  if (!game) return res.status(404).json({ error: 'Spiel nicht gefunden' });

  // Load lineup players with their RSVPs
  const { data: lineupRows } = await supabase
    .from('lineups').select('players(*)').eq('game_id', gameId);
  const lineupPlayers = lineupRows.map(r => r.players);

  const { data: rsvpRows } = await supabase
    .from('rsvps').select('*').eq('game_id', gameId);
  const rsvpMap = Object.fromEntries(rsvpRows.map(r => [r.player_id, r]));

  const drivers = lineupPlayers
    .filter(p => {
      const mode = rsvpMap[p.id]?.mode;
      // Explicitly driving, OR has a car and hasn't responded yet (default: drives)
      return mode === 'driving' || (!mode || mode === 'pending') && p.has_car;
    })
    .map(p => ({ ...p, seats_available: rsvpMap[p.id]?.seats_available || 2 }));

  const riders = lineupPlayers
    .filter(p => rsvpMap[p.id]?.mode === 'riding')
    .map(p => ({ ...p, seats_needed: rsvpMap[p.id]?.seats_needed || 1 }));

  // Players with no car and no response are also treated as riders needing 1 seat
  const pendingNocar = lineupPlayers.filter(p => {
    const mode = rsvpMap[p.id]?.mode;
    return (!mode || mode === 'pending') && !p.has_car;
  }).map(p => ({ ...p, seats_needed: 1 }));

  const allRiders = [...riders, ...pendingNocar];

  const dest = { lat: game.dest_lat, lng: game.dest_lng };

  if (!drivers.length) return res.status(400).json({ error: 'Keine Fahrer gefunden – bitte mindestens einen Spieler mit Auto in der Aufstellung' });

  // Compute
  const groups = await computeGroups(drivers, allRiders, dest);

  // Delete old assignments
  await supabase.from('assignments').delete().eq('game_id', gameId);

  // Insert new
  const inserts = groups.map(g => ({ game_id: gameId, ...g }));
  const { data: saved, error } = await supabase
    .from('assignments').insert(inserts).select();
  if (error) return res.status(500).json({ error: error.message });

  // Update game status
  await supabase.from('games').update({ status: 'calculated' }).eq('id', gameId);

  res.json(saved);
});

// POST: publish assignments
app.post('/api/games/:id/publish', async (req, res) => {
  const { error } = await supabase
    .from('games').update({ status: 'published' }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Admin auth (simple password) ─────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ ok: true, token: Buffer.from(password).toString('base64') });
  } else {
    res.status(401).json({ error: 'Falsches Passwort' });
  }
});

app.get('/api/admin/verify', (req, res) => {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  const pw = auth ? Buffer.from(auth, 'base64').toString() : '';
  res.json({ ok: pw === process.env.ADMIN_PASSWORD });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
