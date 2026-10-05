// Fired once per reveal, the frame the answer pin touches down (its own clock,
// so it follows the bullseye slow motion).
function answerLanded(anim) {
  anim.landed = true;
  if (anim.tier === 'bullseye') {
    audio.thump(1.7);
    audio.chime();
  } else {
    audio.thump();
    if (anim.tier === 'blowout') audio.bwomp();
  }
  popPostcard(anim.b);
}

function watchAnswerLanding(anim) {
  if (anim.answerDropped && !anim.landed && correctPin.t >= LAND_T) answerLanded(anim);
}

// Pull back to the north-up framing of both pins, handing the distance over
// to the reveal card. Shared by the flight and the bullseye.
function startPullback(anim) {
  anim.pullbackStarted = true;
  anim.pullbackAt = anim.elapsed;
  travelHead.visible = false;
  setCameraNear(0.05);
  setCameraFov(FOV);
  audio.whooshStop();
  anim.pullbackDist = dist;
  anim.pullbackFrom = { yaw, pitch };
  frameRevealPoints(anim.a, anim.b);
  // Settle on the load-time tilt (north up, 20 deg toward the viewer) rather
  // than whatever pitch centred the route; the existing yaw/pitch ease below
  // carries the globe there during the pullback, so there is no extra turn.
  anim.pullbackTo = homeRevealView(anim.a, anim.b, revealView);
  targetDist = anim.pullbackTo.dist;
  anim.finalDist = targetDist;
  // Hand the distance over to the card: fade the pill out and the card in
  // while the camera pulls back, instead of a blank beat then a hard pop.
  if (!gameEls.travelDistance.hidden) fadeElement(gameEls.travelDistance, false, 200);
  if (!bullseyeStamp.hidden) fadeElement(bullseyeStamp, false, 260);
  gameEls.reveal.classList.remove('travel-pending');
  fadeElement(gameEls.reveal, true, 420, 180);
}

function updatePullback(anim, pullbackDuration = 1.0) {
  const since = anim.elapsed - anim.pullbackAt;
  const pullbackT = smoothstep(clamp(since / pullbackDuration, 0, 1));
  targetDist = anim.pullbackDist + (anim.finalDist - anim.pullbackDist) * pullbackT;
  anim.pinBlend = Math.min(anim.pinBlend, 1 - pullbackT);
  // The polaroid drops into the card once the card has faded in.
  if (since >= 0.72) settlePostcard();
  // Ease the view across instead of retargeting the damper in one step, which
  // started the globe turning at full speed (a visible kick on long routes).
  // A touch during the pullback hands the view to the player.
  if (pointers.size > 0) anim.viewFree = true;
  if (!anim.viewFree) {
    revealView = {
      yaw: THREE.MathUtils.lerp(anim.pullbackFrom.yaw, anim.pullbackTo.yaw, pullbackT),
      pitch: THREE.MathUtils.lerp(anim.pullbackFrom.pitch, anim.pullbackTo.pitch, pullbackT),
      lambda: 14,
    };
  }
  if (since >= pullbackDuration) {
    targetDist = anim.finalDist;
    if (!anim.viewFree) revealView = anim.pullbackTo;
    settlePostcard();
    travelAnimation = null;
  }
}

function updateBullseyeAnimation(anim, dt) {
  const zoomStart = 0.45; // let the guess pin land first
  const dropAt = 0.95;
  const slowFor = 1.0; // real seconds of slow motion after touchdown
  if (anim.elapsed < zoomStart) return;
  if (!anim.zooming) {
    anim.zooming = true;
    audio.whooshStart();
  }
  // Snap: a fast damper straight down onto the answer, a quick rising zip.
  followTravelPoint(anim.b, 14);
  if (!anim.landed) targetDist = Math.max(MIN_DIST, 1.42);
  const zip = clamp((anim.elapsed - zoomStart) / 0.45, 0, 1);
  audio.whooshSet(Math.sin(Math.PI * zip) * 0.8, 0.3 + 0.7 * zip);
  if (zip >= 1) audio.whooshStop();

  if (anim.elapsed >= dropAt && !anim.answerDropped) {
    correctPin.drop(anim.b);
    anim.answerDropped = true;
  }
  watchAnswerLanding(anim);
  if (!anim.landed) return;

  if (anim.landedAt == null) {
    anim.landedAt = anim.elapsed;
    anim.wave = 0;
    shockwave.quaternion.setFromUnitVectors(_UP, anim.b);
    shockwave.visible = true;
    bullseyeStamp.hidden = false;
    bullseyeStamp.animate([
      { transform: 'translate(-50%, -50%) rotate(-24deg) scale(2.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) rotate(-7deg) scale(.92)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -50%) rotate(-9deg) scale(1)', opacity: 1 },
    ], { duration: 380, delay: 120, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
    if (navigator.vibrate) navigator.vibrate([18, 40, 30]);
  }
  const since = anim.elapsed - anim.landedAt;
  // Drop into slow motion on impact and ease back to full speed.
  timeScale = since < slowFor ? 0.3 : THREE.MathUtils.lerp(0.3, 1, smoothstep(clamp((since - slowFor) / 0.4, 0, 1)));
  // A slow push-in while time is stretched.
  targetDist = Math.max(MIN_DIST, 1.42 - 0.05 * smoothstep(clamp(since / slowFor, 0, 1)));
  anim.wave += (dt * timeScale) / 0.9;
  shockwaveMat.uniforms.uP.value = Math.min(anim.wave, 1);
  shockwaveMat.uniforms.uRadius.value = 0.3 * anim.pinScale;
  shockwave.visible = anim.wave < 1;

  if (since < slowFor + 0.55) return;
  if (!anim.pullbackStarted) startPullback(anim);
  updatePullback(anim);
}

function updateTravelAnimation(dt, pinScale) {
  if (!travelAnimation) return;
  const anim = travelAnimation;
  anim.elapsed += dt;
  anim.pinScale = pinScale;
  if (anim.tier === 'bullseye') {
    updateBullseyeAnimation(anim, dt);
    return;
  }
  const diveStart = 0.6; // 0.5 s pin drop, then a tiny breath before the dive
  const diveDuration = anim.diveDuration;
  const travelDuration = anim.travelDuration;
  const arriveDuration = anim.arriveDuration;
  const arriveBlend = 0.5;
  const flyDist = Math.max(MIN_DIST, 1 + anim.flyAlt);
  const arriveDist = Math.max(MIN_DIST, 1.52);
  const flyStart = diveStart + diveDuration;
  const arriveStart = flyStart + travelDuration;
  const pullbackStart = arriveStart + arriveDuration;

  if (anim.elapsed < diveStart) return;

  // The dive and arrive phases blend the camera between the orbit view and the
  // flight pose; previously both ends hard-cut (orbit altitude 0.36 looking
  // straight down <-> first-person at 0.075), and on arrival the orbit view was
  // still centred on the guess, so it snapped back and swung across the globe.
  if (anim.elapsed < flyStart) {
    const diveT = smoothstep(clamp((anim.elapsed - diveStart) / diveDuration, 0, 1));
    followTravelPoint(anim.a, 10);
    targetDist = anim.startDist + (flyDist - anim.startDist) * diveT;
    anim.pinBlend = diveT;
    placeTravelCamera(anim, 0, diveT);
    audio.whooshStart();
    audio.whooshSet(0.35 * diveT, 0.15 * diveT);
    return;
  }

  const travelU = (anim.elapsed - flyStart) / travelDuration;
  const travelT = anim.progress(travelU);
  if (anim.elapsed < arriveStart) {
    answerLine.visible = true;
    if (gameEls.travelDistance.hidden) {
      gameEls.travelDistance.hidden = false;
      fadeElement(gameEls.travelDistance, true, 220);
    }
    trimTravelLine(anim, travelT);
    const head = travelPointAt(anim, travelT);
    travelHead.position.copy(head).multiplyScalar(routeRadius(anim.angle, travelT));
    travelHead.visible = true;
    // Keep the orbit view moving with the flight so that when the camera blends
    // back out on arrival it is already above the answer. Interpolating the
    // endpoint views (rather than chasing the head's yaw) avoids a sudden
    // 180 deg globe spin, and a sweep of the world-space lighting, whenever a
    // route passes near a pole.
    if (!anim.flightViews) {
      const from = travelView(anim.a);
      const to = travelView(anim.b);
      from.yaw = nearAngle(from.yaw, yaw);
      to.yaw = nearAngle(to.yaw, from.yaw);
      anim.flightViews = { from, to };
    }
    const { from, to } = anim.flightViews;
    revealView = {
      yaw: THREE.MathUtils.lerp(from.yaw, to.yaw, travelT),
      pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, travelT),
      lambda: 10,
    };
    targetDist = flyDist;
    anim.pinBlend = 1;
    // Whoosh: volume follows the progress velocity (relative to cruise), pitch
    // the real ground speed, so a blowout screams and a near miss sighs.
    const rate = dt > 0 ? (travelT - anim.lastT) / (dt / travelDuration) : 0;
    anim.lastT = travelT;
    const level = clamp(rate / 1.22, 0, 1);
    const groundSpeed = clamp((rate * anim.angle) / travelDuration / 1.9, 0, 1);
    audio.whooshSet(0.35 + 0.65 * level, level * (0.25 + 0.75 * Math.sqrt(groundSpeed)));
    // Whip-pan: the lens widens with speed so the globe streaks past.
    if (anim.tier === 'blowout') setCameraFov(FOV + 14 * level);
    placeTravelCamera(anim, travelT, 1);
    sizeTravelHead();
    // Same progress as the head (the old ease-out counter ran ~35% ahead of
    // the marker mid-flight).
    gameEls.travelDistance.querySelector('span').textContent = `${Math.round(anim.km * travelT).toLocaleString()} km`;
    if (anim.tier === 'near') gameEls.travelDistance.classList.toggle('suspense', travelU > 0.45);
    return;
  }

  if (!anim.answerDropped) {
    trimTravelLine(anim, 1);
    setCameraFov(FOV);
    audio.whooshStop();
    const pill = gameEls.travelDistance;
    pill.querySelector('span').textContent = `${anim.km.toLocaleString()} km`;
    pill.classList.remove('suspense');
    if (anim.tier === 'blowout') {
      pill.classList.add('deadpan');
      pill.querySelector('small').textContent = DEADPAN_LINES[Math.floor(Math.random() * DEADPAN_LINES.length)];
    }
    correctPin.drop(anim.b);
    anim.answerDropped = true;
    anim.flyRef = null; // w is ~1 here, so re-picking the short way is invisible
  }
  watchAnswerLanding(anim);
  if (anim.elapsed < pullbackStart) {
    const arriveT = smoothstep(clamp((anim.elapsed - arriveStart) / arriveBlend, 0, 1));
    followTravelPoint(anim.b, 10);
    targetDist = flyDist + (arriveDist - flyDist) * arriveT;
    placeTravelCamera(anim, 1, 1 - arriveT);
    // Shrink the head into the landing pin instead of blinking it out.
    const shrink = 1 - clamp((anim.elapsed - arriveStart) / 0.18, 0, 1);
    travelHead.position.copy(anim.b).multiplyScalar(routeRadius(anim.angle, 1));
    travelHead.visible = shrink > 0;
    if (shrink > 0) sizeTravelHead(smoothstep(shrink));
    return;
  }

  if (!anim.pullbackStarted) startPullback(anim);
  updatePullback(anim);
}
