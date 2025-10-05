import { gsap } from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "./App.css";
import audioSrc from "./audio.mp3";

const HEART_VERTEX_SHADER = /* glsl */ `
#define M_PI 3.1415926535897932384626433832795
uniform float uTime;
uniform float uSize;
attribute float aScale;
attribute vec3 aColor;
attribute float random;
attribute float random1;
attribute float aSpeed;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  float signValue = 2.0 * (step(random, 0.5) - 0.5);
  float t = signValue * mod(-uTime * aSpeed * 0.005 + 10.0 * aSpeed * aSpeed, M_PI);
  float a = pow(t, 2.0) * pow((t - signValue * M_PI), 2.0);
  float radius = 0.08;
  vec3 myOffset = vec3(t, 1.0, 0.0);
  myOffset = vec3(
    radius * 16.0 * pow(sin(t), 2.0) * sin(t),
    radius * (13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t)),
    0.15 * (a * (random1 - 0.5)) * sin(abs(10.0 * (sin(0.2 * uTime + 0.2 * random))) * t)
  );
  vec3 displacedPosition = myOffset;
  vec4 modelPosition = modelMatrix * vec4(displacedPosition.xyz, 1.0);

  vec4 viewPosition = viewMatrix * modelPosition;
  viewPosition.xyz += position * aScale * uSize * pow(a, 0.5) * 0.5;
  gl_Position = projectionMatrix * viewPosition;

  vColor = aColor;
  vUv = uv;
}
`;

const HEART_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 color = vColor;
  float strength = distance(uv, vec2(0.5));
  strength *= 2.0;
  strength = 1.0 - strength;
  gl_FragColor = vec4(strength * color, 1.0);
}
`;

const SNOW_VERTEX_SHADER = /* glsl */ `
#define M_PI 3.1415926535897932384626433832795
uniform float uTime;
uniform float uSize;
attribute float aScale;
attribute vec3 aColor;
attribute float phi;
attribute float random;
attribute float random1;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  float t = 0.01 * uTime + 12.0;
  float angle = phi;
  t = mod((-uTime + 100.0) * 0.06 * random1 + random * 2.0 * M_PI, 2.0 * M_PI);
  vec3 myOffset = vec3(
    5.85 * cos(angle * t),
    2.0 * (t - M_PI),
    3.0 * sin(angle * t / t)
  );
  vec4 modelPosition = modelMatrix * vec4(myOffset, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  viewPosition.xyz += position * aScale * uSize;
  gl_Position = projectionMatrix * viewPosition;

  vColor = aColor;
  vUv = uv;
}
`;

const SNOW_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uTex;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 color = vColor;
  float strength = distance(uv, vec2(0.5, 0.65));
  strength *= 2.0;
  strength = 1.0 - strength;
  vec3 textureColor = texture2D(uTex, uv).rgb;
  gl_FragColor = vec4(textureColor * color * (strength + 0.3), 1.0);
}
`;


class BirthdayCake {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d");
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.cakeMetrics = null;

    this.time = 0;
    this.lastTime = 0;

    this.confetti = [];
    this.sparkles = [];
    this.orbiters = [];
    this.pointerBursts = [];
    this.sprinkles = [];
    this.candleFlickerSeeds = [];

    this.mouse = { x: 0, y: 0, isInside: false };
    this.lastPointerBurst = 0;

    this.cakePulse = { scale: 1 };
    this.glowPulse = { strength: 0.6 };

    gsap.to(this.cakePulse, {
      scale: 1.05,
      duration: 1.6,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });

    gsap.to(this.glowPulse, {
      strength: 1,
      duration: 2.4,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });

    this.handleResize = this.handleResize.bind(this);
    this.loop = this.loop.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);

    this.handleResize();
    this.seedElements();

    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });

    this.disposed = false;
    this.loopId = requestAnimationFrame(this.loop);
  }

  handleResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.floor(this.width * this.pixelRatio);
    this.canvas.height = Math.floor(this.height * this.pixelRatio);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    this.centerX = this.width / 2;
    this.centerY = this.height * 0.6;

    const baseWidth = Math.min(this.width * 0.42, 420);
    const baseHeight = baseWidth * 0.38;

    this.cakeMetrics = {
      baseWidth,
      baseHeight,
      middleWidth: baseWidth * 0.78,
      middleHeight: baseHeight * 0.82,
      topWidth: baseWidth * 0.62,
      topHeight: baseHeight * 0.68,
      spacing: baseHeight * 0.36,
    };

    if (this.confetti.length === 0) {
      this.seedElements();
    } else {
      this.resetConfetti();
      this.resetSparkles();
      this.resetOrbiters();
      this.resetSprinkles();
    }
  }

  seedElements() {
    this.resetConfetti();
    this.resetSparkles();
    this.resetOrbiters();
    this.resetSprinkles();
    this.candleFlickerSeeds = Array.from({ length: 9 }, () => Math.random() * Math.PI * 2);
  }

  resetConfetti() {
    const confettiCount = Math.floor(140 + this.width * 0.12);
    this.confetti = Array.from({ length: confettiCount }, (_, index) =>
      this.createConfettiParticle(index / confettiCount)
    );
  }

  resetSparkles() {
    const sparkleCount = 70;
    this.sparkles = Array.from({ length: sparkleCount }, (_, index) =>
      this.createSparkleParticle(index)
    );
  }

  resetOrbiters() {
    const orbiterCount = 16;
    this.orbiters = Array.from({ length: orbiterCount }, (_, index) =>
      this.createOrbiterParticle(index)
    );
  }

  resetSprinkles() {
    const { topWidth } = this.cakeMetrics;
    if (!topWidth) {
      this.sprinkles = [];
      return;
    }
    const count = 120;
    const radiusX = topWidth / 2;
    this.sprinkles = Array.from({ length: count }, (_, index) => ({
      angle: (index / count) * Math.PI * 2,
      radius: radiusX * (0.3 + Math.random() * 0.55),
      wobbleOffset: Math.random() * Math.PI * 2,
      colorIndex: index % 4,
      size: 2.6 + Math.random() * 1.6,
    }));
  }

  createConfettiParticle(progress = Math.random()) {
    const palette = ["#ff8dc7", "#ffda74", "#8be7ff", "#c7a0ff", "#ff9f9f", "#8cf8b9"];
    return {
      x: Math.random() * this.width,
      y: progress * (this.height + 240) - 120,
      size: 4 + Math.random() * 6,
      speedX: (Math.random() - 0.5) * 40,
      speedY: 50 + Math.random() * 70,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 1.6,
      color: palette[Math.floor(Math.random() * palette.length)],
    };
  }

  createSparkleParticle() {
    const radius = Math.min(this.width, this.height) * 0.42;
    return {
      angle: Math.random() * Math.PI * 2,
      radius: radius * (0.42 + Math.random() * 0.25),
      speed: 0.4 + Math.random() * 0.6,
      size: 1.5 + Math.random() * 2.5,
      twinkleOffset: Math.random() * Math.PI * 2,
      orbitTilt: 0.18 + Math.random() * 0.12,
    };
  }

  createOrbiterParticle(index) {
    const baseRadius = Math.min(this.width, this.height) * 0.32;
    const colorChoices = ["#ffd8f5", "#ffe27d", "#d4f6ff", "#f7a9ff"];
    return {
      angle: (index / 8) * Math.PI + Math.random() * 0.4,
      radius: baseRadius * (0.96 + Math.random() * 0.25),
      speed: 0.25 + Math.random() * 0.2,
      size: 12 + Math.random() * 20,
      color: colorChoices[index % colorChoices.length],
      wobble: Math.random() * Math.PI * 2,
    };
  }

  onPointerMove(event) {
    this.mouse = { x: event.clientX, y: event.clientY, isInside: true };
    const now = performance.now();
    if (now - this.lastPointerBurst > 260) {
      this.createPointerBurst(this.mouse.x, this.mouse.y);
      this.lastPointerBurst = now;
    }
  }

  onPointerLeave() {
    this.mouse.isInside = false;
  }

  onPointerDown(event) {
    this.createPointerBurst(event.clientX, event.clientY, true);
  }

  onTouchMove(event) {
    if (event.touches.length === 0) {
      return;
    }
    const touch = event.touches[0];
    this.onPointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    event.preventDefault();
  }

  createPointerBurst(x, y, intense = false) {
    this.pointerBursts.push({
      x,
      y,
      radius: 0,
      maxRadius: intense ? 220 : 160,
      life: 1,
      hue: 300 + Math.random() * 60,
      lineWidth: intense ? 6 : 4,
    });
  }

  updateConfetti(deltaSeconds) {
    this.confetti.forEach((piece, index) => {
      piece.x += piece.speedX * deltaSeconds;
      piece.y += piece.speedY * deltaSeconds;
      piece.rotation += piece.rotationSpeed * deltaSeconds;

      if (piece.y > this.height + 120) {
        this.confetti[index] = this.createConfettiParticle(0);
        this.confetti[index].y = -100;
      }

      if (piece.x < -50) {
        piece.x = this.width + 50;
      } else if (piece.x > this.width + 50) {
        piece.x = -50;
      }
    });
  }

  updateSparkles(deltaSeconds) {
    this.sparkles.forEach((sparkle) => {
      sparkle.angle += sparkle.speed * deltaSeconds;
    });
  }

  updateOrbiters(deltaSeconds) {
    this.orbiters.forEach((orbiter) => {
      orbiter.angle += orbiter.speed * deltaSeconds;
      orbiter.wobble += deltaSeconds * 2;
    });
  }

  updatePointerBursts(deltaSeconds) {
    this.pointerBursts = this.pointerBursts
      .map((burst) => ({
        ...burst,
        radius: burst.radius + burst.maxRadius * deltaSeconds * 1.6,
        life: burst.life - deltaSeconds * 1.3,
      }))
      .filter((burst) => burst.life > 0);
  }

  loop(now) {
    if (this.disposed) {
      return;
    }

    if (!this.lastTime) {
      this.lastTime = now;
    }

    const delta = Math.min(now - this.lastTime, 100);
    const deltaSeconds = delta / 1000;

    this.time += delta;
    this.updateConfetti(deltaSeconds);
    this.updateSparkles(deltaSeconds);
    this.updateOrbiters(deltaSeconds);
    this.updatePointerBursts(deltaSeconds);

    this.drawScene();

    this.lastTime = now;
    this.loopId = requestAnimationFrame(this.loop);
  }

  drawScene() {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    this.drawConfetti();
    this.drawSparkles();
    this.drawOrbiters();
    this.drawCake();
    this.drawPointerBursts();
    this.drawForegroundDust();
    this.ctx.restore();
  }

  drawBackground() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#200a21");
    gradient.addColorStop(0.45, "#2a0d2a");
    gradient.addColorStop(1, "#120413");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const glowGradient = this.ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      Math.min(this.width, this.height) * 0.12,
      this.centerX,
      this.centerY,
      Math.max(this.width, this.height) * 0.75
    );
    glowGradient.addColorStop(0, `rgba(255, 185, 240, ${0.18 + this.glowPulse.strength * 0.22})`);
    glowGradient.addColorStop(1, "rgba(18, 4, 19, 0.1)");
    this.ctx.fillStyle = glowGradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawConfetti() {
    this.ctx.save();
    this.ctx.globalAlpha = 0.85;
    this.confetti.forEach((piece) => {
      this.ctx.save();
      this.ctx.translate(piece.x, piece.y);
      this.ctx.rotate(piece.rotation);
      const gradient = this.ctx.createLinearGradient(0, -piece.size, 0, piece.size);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.85)");
      gradient.addColorStop(1, piece.color);
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(-piece.size / 2, -piece.size, piece.size, piece.size * 1.8);
      this.ctx.restore();
    });
    this.ctx.restore();
  }

  drawSparkles() {
    const { spacing } = this.cakeMetrics;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";
    this.sparkles.forEach((sparkle) => {
      const progress = Math.sin(this.time * 0.003 + sparkle.twinkleOffset) * 0.5 + 0.5;
      const size = sparkle.size * (0.7 + progress * 0.8);
      const x = this.centerX + Math.cos(sparkle.angle) * sparkle.radius;
      const y =
        this.centerY -
        spacing * 1.2 +
        Math.sin(sparkle.angle * sparkle.orbitTilt + this.time * 0.001) * 24;
      this.ctx.globalAlpha = 0.4 + progress * 0.6;
      this.ctx.fillStyle = "#ffe8ff";
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  drawOrbiters() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    const heightOffset = this.cakeMetrics.baseHeight * 0.2;

    this.orbiters.forEach((orbiter) => {
      const wobble = Math.sin(orbiter.wobble) * 6;
      const x = this.centerX + Math.cos(orbiter.angle) * orbiter.radius;
      const y =
        this.centerY -
        this.cakeMetrics.spacing +
        Math.sin(orbiter.angle * 0.6) * 40 +
        wobble -
        heightOffset;

      this.ctx.save();
      this.ctx.translate(x, y);
      const pulse =
        0.6 + Math.sin(this.time * 0.003 + orbiter.angle * 3 + orbiter.wobble) * 0.25;
      this.ctx.scale(pulse, pulse);
      this.drawHeartShape(0, 0, orbiter.size, orbiter.color);
      this.ctx.restore();
    });

    this.ctx.restore();
  }

  drawHeartShape(x, y, size, color) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.bezierCurveTo(-size * 0.5, -size * 0.65, -size, -size * 0.05, 0, size);
    this.ctx.bezierCurveTo(size, -size * 0.05, size * 0.5, -size * 0.65, 0, 0);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  drawCake() {
    const { baseWidth, baseHeight, middleWidth, middleHeight, topWidth, topHeight, spacing } =
      this.cakeMetrics;

    this.ctx.save();
    this.ctx.translate(this.centerX, this.centerY);
    this.ctx.scale(this.cakePulse.scale, this.cakePulse.scale);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.ellipse(0, baseHeight * 0.9, baseWidth * 0.7, baseWidth * 0.22, 0, 0, Math.PI * 2);
    const shadow = this.ctx.createRadialGradient(
      0,
      baseHeight * 0.9,
      baseWidth * 0.1,
      0,
      baseHeight * 0.9,
      baseWidth * 0.85
    );
    shadow.addColorStop(0, "rgba(0, 0, 0, 0.32)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = shadow;
    this.ctx.fill();
    this.ctx.restore();

    this.ctx.shadowColor = "rgba(255, 120, 220, 0.35)";
    this.ctx.shadowBlur = 24;

    const layers = [
      {
        width: baseWidth,
        height: baseHeight,
        y: 0,
        colors: {
          topLight: "#ffeafc",
          top: "#ffd3f4",
          topShadow: "#f7a8d6",
          sideLight: "#ffbadf",
          sideDark: "#ff6dba",
        },
      },
      {
        width: middleWidth,
        height: middleHeight,
        y: -baseHeight + spacing,
        colors: {
          topLight: "#fff2e9",
          top: "#ffdcd4",
          topShadow: "#ffb4a4",
          sideLight: "#ffc2b0",
          sideDark: "#ff8c7f",
        },
      },
      {
        width: topWidth,
        height: topHeight,
        y: -baseHeight - middleHeight + spacing * 2,
        colors: {
          topLight: "#e8f7ff",
          top: "#d6edff",
          topShadow: "#9dd1ff",
          sideLight: "#bfe1ff",
          sideDark: "#6fb6ff",
        },
      },
    ];

    layers.forEach((layer, index) => {
      this.drawCakeLayer(layer);
      if (index === 0) {
        this.drawIcing(layer, 18, 8);
      } else if (index === 1) {
        this.drawIcing(layer, 14, 6);
      } else {
        this.drawIcing(layer, 10, 5);
      }
    });

    this.ctx.shadowBlur = 0;

    this.drawSprinkles(layers[2]);
    this.drawCandles(layers[2]);

    this.ctx.restore();
  }

  drawCakeLayer(layer) {
    const { width, height, y, colors } = layer;
    const radiusX = width / 2;
    const radiusY = width / 6;
    const topY = y - height;

    const sideGradient = this.ctx.createLinearGradient(0, topY, 0, y + radiusY);
    sideGradient.addColorStop(0, colors.sideLight);
    sideGradient.addColorStop(1, colors.sideDark);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(-radiusX, topY);
    this.ctx.lineTo(-radiusX, y);
    this.ctx.ellipse(0, y, radiusX, radiusY, 0, Math.PI, 0);
    this.ctx.lineTo(radiusX, topY);
    this.ctx.ellipse(0, topY, radiusX, radiusY, 0, 0, Math.PI, false);
    this.ctx.closePath();
    this.ctx.fillStyle = sideGradient;
    this.ctx.fill();
    this.ctx.lineWidth = 1.4;
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    this.ctx.stroke();

    const topGradient = this.ctx.createLinearGradient(-radiusX, topY - radiusY, radiusX, topY);
    topGradient.addColorStop(0, colors.topLight);
    topGradient.addColorStop(0.5, colors.top);
    topGradient.addColorStop(1, colors.topShadow);
    this.ctx.beginPath();
    this.ctx.ellipse(0, topY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.fillStyle = topGradient;
    this.ctx.fill();

    this.ctx.restore();
  }

  drawIcing(layer, segments, amplitude) {
    const { width, height, y } = layer;
    const radiusX = width / 2;
    const radiusY = width / 6;
    const topY = y - height;
    const segmentWidth = (radiusX * 2) / segments;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    this.ctx.lineWidth = 2;
    this.ctx.lineJoin = "round";
    this.ctx.beginPath();
    for (let i = 0; i <= segments; i += 1) {
      const progress = i / segments;
      const angle = progress * Math.PI * 2;
      const wave = Math.sin(angle * 2 + this.time * 0.004) * amplitude;
      const x = -radiusX + segmentWidth * i;
      const yPos = topY + radiusY + wave;
      if (i === 0) {
        this.ctx.moveTo(x, yPos);
      } else {
        this.ctx.lineTo(x, yPos);
      }
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawSprinkles(topLayer) {
    if (!this.sprinkles.length) {
      return;
    }
    const { width, height, y } = topLayer;
    const radiusY = width / 6;
    const topY = y - height;
    const sprinkleColors = ["#ff769b", "#ffe26f", "#79f3ff", "#c5a6ff"];

    this.ctx.save();
    this.sprinkles.forEach((sprinkle) => {
      const x = Math.cos(sprinkle.angle) * sprinkle.radius;
      const yOffset = Math.sin(sprinkle.angle) * radiusY * 0.6;
      const wobble = Math.sin(this.time * 0.004 + sprinkle.wobbleOffset) * 4;
      this.ctx.save();
      this.ctx.translate(x, topY + yOffset + wobble);
      this.ctx.rotate(sprinkle.angle);
      this.ctx.fillStyle = sprinkleColors[sprinkle.colorIndex];
      this.ctx.fillRect(-sprinkle.size / 2, -sprinkle.size / 2, sprinkle.size, sprinkle.size * 0.6);
      this.ctx.restore();
    });
    this.ctx.restore();
  }

  drawCandles(topLayer) {
    const { width, height, y } = topLayer;
    const radiusX = width / 2;
    const radiusY = width / 6;
    const topY = y - height;
    const candleCount = this.candleFlickerSeeds.length || 8;
    const candleColors = ["#ff9fbf", "#ffdd7f", "#8fe8ff", "#cfa3ff"];

    for (let i = 0; i < candleCount; i += 1) {
      const angle = (i / candleCount) * Math.PI * 2;
      const radius = radiusX * 0.72;
      const x = Math.cos(angle) * radius;
      const yOffset = Math.sin(angle) * radiusY * 0.6;
      const flicker = 1 + Math.sin(this.time * 0.005 + this.candleFlickerSeeds[i]) * 0.15;
      const candleHeight = height * 0.9;
      const candleWidth = width * 0.05;

      this.ctx.save();
      this.ctx.translate(x, topY + yOffset - candleHeight);
      this.ctx.rotate(Math.sin(this.time * 0.001 + angle) * 0.02);

      const candleGradient = this.ctx.createLinearGradient(0, candleHeight, 0, 0);
      const color = candleColors[i % candleColors.length];
      candleGradient.addColorStop(0, `${color}55`);
      candleGradient.addColorStop(0.5, color);
      candleGradient.addColorStop(1, "#ffffff");

      this.ctx.fillStyle = candleGradient;
      this.ctx.fillRect(-candleWidth / 2, 0, candleWidth, candleHeight);

      this.ctx.fillStyle = "#44210a";
      this.ctx.fillRect(-candleWidth * 0.08, -6, candleWidth * 0.16, 6);

      const flameHeight = candleHeight * 0.38 * flicker;
      const flameWidth = candleWidth * 0.9 * flicker;

      this.ctx.save();
      this.ctx.translate(0, -6);
      this.ctx.globalCompositeOperation = "lighter";

      const flameGradient = this.ctx.createRadialGradient(
        0,
        -flameHeight * 0.3,
        0,
        0,
        0,
        flameHeight
      );
      flameGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      flameGradient.addColorStop(0.4, "rgba(255, 200, 120, 0.9)");
      flameGradient.addColorStop(1, "rgba(255, 120, 60, 0.05)");

      this.ctx.beginPath();
      this.ctx.moveTo(0, -flameHeight);
      this.ctx.bezierCurveTo(
        flameWidth,
        -flameHeight * 0.6,
        flameWidth * 0.4,
        0,
        0,
        flameHeight * 0.2
      );
      this.ctx.bezierCurveTo(
        -flameWidth * 0.4,
        0,
        -flameWidth,
        -flameHeight * 0.6,
        0,
        -flameHeight
      );
      this.ctx.fillStyle = flameGradient;
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.ellipse(0, -flameHeight * 0.35, flameWidth * 1.6, flameHeight * 1.6, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = "rgba(255, 180, 90, 0.25)";
      this.ctx.fill();

      this.ctx.restore();
      this.ctx.restore();
    }
  }

  drawPointerBursts() {
    if (this.pointerBursts.length === 0) {
      return;
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";
    this.pointerBursts.forEach((burst) => {
      this.ctx.globalAlpha = Math.max(burst.life, 0) * 0.7;
      this.ctx.lineWidth = burst.lineWidth;
      this.ctx.strokeStyle = `hsla(${burst.hue}, 100%, 75%, ${burst.life})`;
      this.ctx.beginPath();
      this.ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.globalAlpha = Math.max(burst.life - 0.2, 0) * 0.35;
      this.ctx.beginPath();
      this.ctx.arc(burst.x, burst.y, burst.radius * 0.6, 0, Math.PI * 2);
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  drawForegroundDust() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    const gradient = this.ctx.createRadialGradient(
      this.centerX,
      this.centerY - this.cakeMetrics.baseHeight,
      0,
      this.centerX,
      this.centerY,
      Math.max(this.width, this.height) * 0.65
    );
    gradient.addColorStop(0, "rgba(255, 180, 240, 0.35)");
    gradient.addColorStop(0.45, "rgba(255, 200, 250, 0.12)");
    gradient.addColorStop(1, "rgba(255, 200, 250, 0)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  dispose() {
    this.disposed = true;
    if (this.loopId) {
      cancelAnimationFrame(this.loopId);
    }
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
  }
}

class HeartWorld {
  constructor({ canvas, overlay, cameraPosition, shaders }) {
    this.canvas = canvas;
    this.overlay = overlay ?? null;
    this.overlayOffset = this.overlay
      ? parseFloat(this.overlay.dataset.offset || "0.14")
      : 0.14;
    this.shaders = shaders;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.clock = new THREE.Clock();
    this.parameters = {
      count: 1500,
      max: 12.5 * Math.PI,
      a: 2,
      c: 4.5,
    };
    this.time = { current: 0, delta: 0, elapsed: 0, frequency: 0.0005 };

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspectRatio = this.width / this.height;

    this.camera = new THREE.PerspectiveCamera(75, this.aspectRatio, 0.1, 100);
    this.camera.position.set(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);

    this.textureLoader = new THREE.TextureLoader();
    this.modelBaseScale = 0.25;
    this.modelPulseTimeline = null;
    this.heartBaseSize = 0.2;
    this.heartPulseTween = null;

    this.heartTipLocal = null;
    this.heartTipWorld = new THREE.Vector3();
    this.heartTipProjected = new THREE.Vector3();

    this.loop = this.loop.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);

    this.addToScene();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("mousemove", this.onMouseMove);

    this.disposed = false;
    this.loopId = requestAnimationFrame(this.loop);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  loop() {
    if (this.disposed) {
      return;
    }

    this.time.elapsed = this.clock.getElapsedTime();
    this.time.delta = Math.min(
      60,
      (this.time.elapsed - this.time.current) * 1000
    );

    const beat = 0.5 + 0.5 * Math.sin(this.time.elapsed * 0.6);
    this.camera.position.x = 0.15 * Math.sin(this.time.elapsed * 0.35);
    this.camera.position.z = 4.5 + 0.35 * Math.sin(this.time.elapsed * 0.18);
    this.camera.lookAt(this.scene.position);

    if (this.heartMaterial) {
      this.heartMaterial.uniforms.uTime.value +=
        this.time.delta * this.time.frequency * (1 + beat * 0.2);
    }
    if (this.model) {
      this.model.rotation.y -= 0.0005 * this.time.delta * (1 + beat);
    }
    if (this.snowMaterial) {
      this.snowMaterial.uniforms.uTime.value +=
        this.time.delta * 0.0004 * (1 + beat);
    }

    this.updateOverlayAnchor();
    this.render();

    this.time.current = this.time.elapsed;
    this.loopId = requestAnimationFrame(this.loop);
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.updateOverlayAnchor();
  }

  onMouseMove(event) {
    gsap.to(this.camera.position, {
      x: gsap.utils.mapRange(0, window.innerWidth, 0.2, -0.2, event.clientX),
      y: gsap.utils.mapRange(0, window.innerHeight, 0.2, -0.2, -event.clientY),
      overwrite: true,
      duration: 0.6,
    });
  }

  addToScene() {
    this.addModel();
    this.addHeart();
    this.addSnow();
  }

  async addModel() {
    try {
      this.model = await this.loadObj(
        "https://assets.codepen.io/74321/heart.glb"
      );
      this.model.scale.set(0.001, 0.001, 0.001);
      this.model.rotation.y = 0;
      const targetScale = this.modelBaseScale;
      this.matcapTexture = this.textureLoader.load(
        "https://assets.codepen.io/74321/3.png",
        () => {
          gsap.to(this.model.scale, {
            x: targetScale,
            y: targetScale,
            z: targetScale,
            duration: 1.5,
            ease: "Elastic.easeOut",
            onComplete: () => {
              this.startModelPulse();
            },
          });
        }
      );

      this.model.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshMatcapMaterial({
            matcap: this.matcapTexture,
            color: new THREE.Color("#ff3366"),
          });
        }
      });

      this.scene.add(this.model);
      gsap.delayedCall(1.7, () => {
        if (!this.disposed && this.model && !this.modelPulseTimeline) {
          this.startModelPulse();
        }
      });
      this.cacheHeartAnchor();
      this.updateOverlayAnchor();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load heart model", err);
    }
  }

  startModelPulse() {
    if (!this.model) {
      return;
    }

    if (this.modelPulseTimeline) {
      this.modelPulseTimeline.kill();
    }

    const base = this.modelBaseScale;
    const maxScale = base * 1.08;
    const minScale = base * 0.94;

    gsap.set(this.model.scale, { x: base, y: base, z: base });

    this.modelPulseTimeline = gsap
      .timeline({ repeat: -1, yoyo: true })
      .to(this.model.scale, {
        x: maxScale,
        y: maxScale,
        z: maxScale,
        duration: 1.6,
        ease: "sine.inOut",
      })
      .to(this.model.scale, {
        x: minScale,
        y: minScale,
        z: minScale,
        duration: 1.6,
        ease: "sine.inOut",
      });
  }

  addHeart() {
    this.heartTexture = new THREE.TextureLoader().load(
      "https://assets.codepen.io/74321/heart.png"
    );

    this.heartMaterial = new THREE.ShaderMaterial({
      fragmentShader: this.shaders.heartFragment,
      vertexShader: this.shaders.heartVertex,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.2 },
        uTex: {
          value: this.heartTexture,
        },
      },
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });

    const count = 3000;
    const scales = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const randoms1 = new Float32Array(count);
    const colorChoices = [
      "#ff66cc",
      "#ff99ff",
      "#ffccff",
      "#ff3366",
      "#ffffff",
    ];

    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    this.heartGeometry = new THREE.InstancedBufferGeometry();

    Object.entries(baseGeometry.attributes).forEach(([key, attribute]) => {
      this.heartGeometry.setAttribute(key, attribute.clone());
    });
    if (baseGeometry.index) {
      this.heartGeometry.setIndex(baseGeometry.index.clone());
    }
    baseGeometry.dispose();

    this.heartGeometry.instanceCount = count;
    this.heartGeometry.maxInstancedCount = count;

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      randoms[i] = Math.random();
      randoms1[i] = Math.random();
      scales[i] = Math.random() * 0.35;
      const colorIndex = Math.floor(Math.random() * colorChoices.length);
      const color = new THREE.Color(colorChoices[colorIndex]);
      colors[i3 + 0] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
      speeds[i] = Math.random() * this.parameters.max;
    }

    this.heartGeometry.setAttribute(
      "random",
      new THREE.InstancedBufferAttribute(randoms, 1, false)
    );
    this.heartGeometry.setAttribute(
      "random1",
      new THREE.InstancedBufferAttribute(randoms1, 1, false)
    );
    this.heartGeometry.setAttribute(
      "aScale",
      new THREE.InstancedBufferAttribute(scales, 1, false)
    );
    this.heartGeometry.setAttribute(
      "aSpeed",
      new THREE.InstancedBufferAttribute(speeds, 1, false)
    );
    this.heartGeometry.setAttribute(
      "aColor",
      new THREE.InstancedBufferAttribute(colors, 3, false)
    );

    this.heart = new THREE.Mesh(this.heartGeometry, this.heartMaterial);
    this.scene.add(this.heart);
    this.heartBaseSize = this.heartMaterial.uniforms.uSize.value;
    this.startHeartPulse();
  }

  startHeartPulse() {
    if (!this.heartMaterial) {
      return;
    }

    if (this.heartPulseTween) {
      this.heartPulseTween.kill();
    }

    const baseSize =
      this.heartBaseSize || this.heartMaterial.uniforms.uSize.value;
    this.heartMaterial.uniforms.uSize.value = baseSize;

    this.heartPulseTween = gsap.to(this.heartMaterial.uniforms.uSize, {
      value: baseSize * 1.25,
      duration: 1.8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  addSnow() {
    this.snowTexture = new THREE.TextureLoader().load(
      "https://assets.codepen.io/74321/heart.png"
    );

    this.snowMaterial = new THREE.ShaderMaterial({
      fragmentShader: this.shaders.snowFragment,
      vertexShader: this.shaders.snowVertex,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.3 },
        uTex: { value: this.snowTexture },
      },
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });

    const count = 550;
    const scales = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const phis = new Float32Array(count);
    const randoms = new Float32Array(count);
    const randoms1 = new Float32Array(count);
    const colorChoices = ["#ff66cc", "#ff99ff", "#ffccff", "#ffffff"];

    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    this.snowGeometry = new THREE.InstancedBufferGeometry();
    Object.entries(baseGeometry.attributes).forEach(([key, attribute]) => {
      this.snowGeometry.setAttribute(key, attribute.clone());
    });
    if (baseGeometry.index) {
      this.snowGeometry.setIndex(baseGeometry.index.clone());
    }
    baseGeometry.dispose();

    this.snowGeometry.instanceCount = count;
    this.snowGeometry.maxInstancedCount = count;

    for (let i = 0; i < count; i += 1) {
      const phi = (Math.random() - 0.5) * 10;
      const i3 = i * 3;
      phis[i] = phi;
      randoms[i] = Math.random();
      randoms1[i] = Math.random();
      scales[i] = Math.random() * 0.35;
      const colorIndex = Math.floor(Math.random() * colorChoices.length);
      const color = new THREE.Color(colorChoices[colorIndex]);
      colors[i3 + 0] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    this.snowGeometry.setAttribute(
      "phi",
      new THREE.InstancedBufferAttribute(phis, 1, false)
    );
    this.snowGeometry.setAttribute(
      "random",
      new THREE.InstancedBufferAttribute(randoms, 1, false)
    );
    this.snowGeometry.setAttribute(
      "random1",
      new THREE.InstancedBufferAttribute(randoms1, 1, false)
    );
    this.snowGeometry.setAttribute(
      "aScale",
      new THREE.InstancedBufferAttribute(scales, 1, false)
    );
    this.snowGeometry.setAttribute(
      "aColor",
      new THREE.InstancedBufferAttribute(colors, 3, false)
    );

    this.snow = new THREE.Mesh(this.snowGeometry, this.snowMaterial);
    this.scene.add(this.snow);
  }

  cacheHeartAnchor() {
    if (!this.model) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.model);
    const tipWorld = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.min.y,
      (bounds.min.z + bounds.max.z) / 2
    );

    if (!this.heartTipLocal) {
      this.heartTipLocal = new THREE.Vector3();
    }

    this.heartTipLocal.copy(tipWorld);
    this.model.worldToLocal(this.heartTipLocal);
  }

  updateOverlayAnchor() {
    if (!this.overlay || !this.model || !this.heartTipLocal) {
      return;
    }

    this.heartTipWorld.copy(this.heartTipLocal);
    this.model.localToWorld(this.heartTipWorld);
    this.heartTipProjected.copy(this.heartTipWorld).project(this.camera);

    const x = (this.heartTipProjected.x * 0.5 + 0.5) * this.width;
    const y = (-this.heartTipProjected.y * 0.5 + 0.5) * this.height;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const offsetY = this.height * this.overlayOffset;
    this.overlay.style.setProperty(
      "--ring-offset-x",
      `${x - this.width / 2}px`
    );
    this.overlay.style.setProperty(
      "--ring-offset-y",
      `${y - this.height / 2 + offsetY}px`
    );
  }

  loadObj(path) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        path,
        (response) => {
          if (response.scene && response.scene.children.length > 0) {
            resolve(response.scene.children[0]);
          } else {
            reject(new Error("Empty scene in GLTF response"));
          }
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }

  dispose() {
    this.disposed = true;

    if (this.loopId) {
      cancelAnimationFrame(this.loopId);
    }

    if (this.modelPulseTimeline) {
      this.modelPulseTimeline.kill();
      this.modelPulseTimeline = null;
    }

    if (this.heartPulseTween) {
      this.heartPulseTween.kill();
      this.heartPulseTween = null;
    }

    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("mousemove", this.onMouseMove);

    if (this.renderer) {
      this.renderer.dispose();
    }

    if (this.heartGeometry) {
      this.heartGeometry.dispose();
    }
    if (this.heartMaterial) {
      this.heartMaterial.dispose();
    }
    if (this.heartTexture) {
      this.heartTexture.dispose();
    }

    if (this.snowGeometry) {
      this.snowGeometry.dispose();
    }
    if (this.snowMaterial) {
      this.snowMaterial.dispose();
    }
    if (this.snowTexture) {
      this.snowTexture.dispose();
    }

    if (this.matcapTexture) {
      this.matcapTexture.dispose();
    }

    if (this.model) {
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.model);
    }

    if (this.heart) {
      this.scene.remove(this.heart);
    }

    if (this.snow) {
      this.scene.remove(this.snow);
    }

    this.scene.clear();
  }
}

const buildTextRings = (container) => {
  let ringInstances = [];
  let animationId = null;
  let lastTimestamp = null;

  const applyLetterTransforms = (instance) => {
    const { letters, step, radius, rotation } = instance;
    if (!letters.length || !step || !radius) {
      return;
    }

    letters.forEach((letterEl, index) => {
      const angle = rotation + index * step;
      letterEl.style.transform = `rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)`;
    });
  };

  const buildRingInstance = (ring, rotation) => {
    const content = (ring.dataset.text || "").trim();
    const letters = Array.from(content);
    const total = letters.length;
    const width = ring.offsetWidth;

    ring.innerHTML = "";

    if (!total || !width) {
      return {
        ring,
        letters: [],
        radius: width / 2,
        step: 0,
        rotation,
        speed: 0,
      };
    }

    const fragment = document.createDocumentFragment();
    const letterNodes = letters.map((character) => {
      const span = document.createElement("span");
      span.className = "ring-letter";
      span.textContent = character === " " ? "\u00A0" : character;
      fragment.appendChild(span);
      return span;
    });

    ring.appendChild(fragment);

    const spacing = parseFloat(ring.dataset.spacing || "1") || 1;
    const step = (360 / total) * spacing;
    const radius = width / 2;
    const speed = parseFloat(ring.dataset.speed || "0") || 0;

    return {
      ring,
      letters: letterNodes,
      radius,
      step,
      rotation,
      speed,
    };
  };

  const animateRings = (timestamp = 0) => {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const delta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    ringInstances.forEach((instance) => {
      if (!instance.letters.length || instance.step === 0) {
        return;
      }

      instance.rotation = (instance.rotation + instance.speed * delta) % 360;
      instance.ring.dataset.rotation = instance.rotation.toString();
      instance.radius = instance.ring.offsetWidth / 2;
      applyLetterTransforms(instance);
    });

    animationId = requestAnimationFrame(animateRings);
  };

  const start = () => {
    if (animationId !== null) {
      return;
    }
    animationId = requestAnimationFrame(animateRings);
  };

  const stop = () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  const create = () => {
    const previousRotation = new Map(
      ringInstances.map((instance) => [instance.ring, instance.rotation])
    );
    ringInstances = [];

    const rings = container.querySelectorAll(".birthday-ring[data-text]");
    rings.forEach((ring) => {
      const rotation =
        previousRotation.get(ring) ?? parseFloat(ring.dataset.rotation || "0");
      const instance = buildRingInstance(ring, rotation);
      ringInstances.push(instance);
      applyLetterTransforms(instance);
    });

    lastTimestamp = null;
    start();
  };

  create();

  return {
    recreate: create,
    stop,
    clear: () => {
      stop();
      ringInstances.forEach(({ ring }) => {
        ring.innerHTML = "";
      });
      ringInstances = [];
    },
  };
};

function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const worldRef = useRef(null);
  const ringsRef = useRef(null);
  const audioRef = useRef(null);
  const secondCanvasRef = useRef(null);
  const secondWorldRef = useRef(null);
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptStage, setPromptStage] = useState("ask");
  const [promptDismissed, setPromptDismissed] = useState(false);
  // Popup is now always centered, no need for positioning state

  const playBackgroundAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, []);

  const handleInteraction = useCallback(() => {
    playBackgroundAudio();

    if (!promptVisible && !promptDismissed) {
      setPromptStage("ask");
      setPromptVisible(true);
    }
  }, [playBackgroundAudio, promptDismissed, promptVisible]);

  const handleAcceptPrompt = useCallback(
    (event) => {
      event.stopPropagation();
      playBackgroundAudio();
      setPromptStage("cheer");
    },
    [playBackgroundAudio]
  );

  const handleDeclinePrompt = useCallback(
    (event) => {
      event.stopPropagation();
      setPromptStage("ask");
      setPromptVisible(true);
      playBackgroundAudio();
      // Show decline toast
      setCelebrationType("decline");
      setCelebrationVisible(true);
    },
    [playBackgroundAudio]
  );

  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationType, setCelebrationType] = useState("accept"); // "accept" or "decline"
  const [showSecondCanvas, setShowSecondCanvas] = useState(false);

  const handleClosePrompt = useCallback(
    (event) => {
      event.stopPropagation();
      setPromptVisible(false);
      setPromptDismissed(true);
      setPromptStage("ask");
      setCelebrationType("accept");
      setCelebrationVisible(true);
      playBackgroundAudio();
      // Show second canvas after a delay
      setTimeout(() => {
        console.log("Setting showSecondCanvas to true");
        setShowSecondCanvas(true);
      }, 1000);
    },
    [playBackgroundAudio]
  );

  useEffect(() => {
    if (celebrationVisible) {
      const timer = setTimeout(() => {
        setCelebrationVisible(false);
      }, 4000);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [celebrationVisible]);

  // Initialize second canvas when it becomes visible
  useEffect(() => {
    if (
      showSecondCanvas &&
      secondCanvasRef.current &&
      !secondWorldRef.current
    ) {
      console.log("Creating birthday cake canvas...");
      secondWorldRef.current = new BirthdayCake({
        canvas: secondCanvasRef.current,
      });

      console.log("Second canvas created successfully!");
    }

    return () => {
      if (secondWorldRef.current) {
        secondWorldRef.current.dispose();
        secondWorldRef.current = null;
      }
    };
  }, [showSecondCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const audio = audioRef.current;
    let detachAudioListener;

    if (!canvas || !overlay) {
      return undefined;
    }

    ringsRef.current = buildTextRings(overlay);
    const handleResize = () => {
      ringsRef.current?.recreate();
    };
    window.addEventListener("resize", handleResize);

    worldRef.current = new HeartWorld({
      canvas,
      overlay,
      cameraPosition: { x: 0, y: 0, z: 4.5 },
      shaders: {
        heartVertex: HEART_VERTEX_SHADER,
        heartFragment: HEART_FRAGMENT_SHADER,
        snowVertex: SNOW_VERTEX_SHADER,
        snowFragment: SNOW_FRAGMENT_SHADER,
      },
    });

    if (audio) {
      const attemptPlay = () => {
        playBackgroundAudio();
      };

      if (audio.readyState >= 2) {
        attemptPlay();
      } else {
        const handleCanPlay = () => {
          audio.removeEventListener("canplay", handleCanPlay);
          attemptPlay();
        };
        audio.addEventListener("canplay", handleCanPlay);
        detachAudioListener = () =>
          audio.removeEventListener("canplay", handleCanPlay);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      detachAudioListener?.();
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      ringsRef.current?.clear();
      ringsRef.current = null;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, [playBackgroundAudio]);

  return (
    <div className="App" onClick={handleInteraction}>
      <title>Hậu nhỏ làm cho bạn</title>
      <canvas className="webgl" ref={canvasRef} aria-hidden="true" />
      <div
        className="birthday-rings"
        ref={overlayRef}
        aria-hidden="true"
        data-offset="0.14"
      >
        <div
          className="birthday-ring ring-outer"
          data-text="Happy Birthday to Phi • Happy Birthday to Phi • Happy Birthday to Phi • "
          data-speed="-7.5"
          data-spacing="1.08"
        />
        <div
          className="birthday-ring ring-middle"
          data-text="Happy Birthday to Phi • Feliz Cumpleaños Phi • Joyeux Anniversaire Phi •"
          data-speed="6.2"
          data-spacing="1.04"
        />
        <div
          className="birthday-ring ring-inner"
          data-text="Happy Birthday to Phi • Chuc Mung Sinh Nhat Phi • Selamat Ulang Tahun Phi •"
          data-speed="-6.8"
          data-spacing="1"
        />
        <div
          className="birthday-ring ring-core"
          data-text="Happy Birthday Phi • With Love •"
          data-speed="5.4"
          data-spacing="0.94"
        />
      </div>
      <div className="audio-embed" aria-label="Background audio credit">
        <audio
          ref={audioRef}
          className="audio-player"
          src={audioSrc}
          loop
          autoPlay
          preload="auto"
          playsInline
          aria-hidden="true"
        />
        <a
          className="audio-credit"
          href="https://audio.com/hau-le-t"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          @hậu nhỏ ^_^
        </a>
      </div>
      {promptVisible && (
        <div
          className="popup-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="popup-card"
            onClick={(event) => event.stopPropagation()}
          >
            {promptStage === "ask" ? (
              <>
                <p className="popup-title">
                  Phi ơi 💖, muốn nghe thêm lời chúc nhỏ không?
                </p>
                <p className="popup-subtitle">
                  Chỉ cần gật đầu là cả bầu trời thương gửi tới ngay nè!
                </p>
                <div className="popup-actions">
                  <button
                    type="button"
                    className="popup-button primary"
                    onClick={handleAcceptPrompt}
                  >
                    Có chứ!
                  </button>
                  <button
                    type="button"
                    className="popup-button"
                    onClick={handleDeclinePrompt}
                  >
                    Để sau nha
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="popup-title">
                  Gửi Phi thêm thiệt nhiều thương 💝
                </p>
                <p className="popup-subtle">
                  Chúc ngày hôm nay lung linh, đầy ắp tiếng cười và những điều
                  ngọt ngào nhất!
                </p>
                <div className="popup-actions">
                  <button
                    type="button"
                    className="popup-button primary"
                    onClick={handleClosePrompt}
                  >
                    Tiếp tục tận hưởng 💗
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {celebrationVisible && (
        <div className="celebration-toast" role="status">
          <div className="celebration-content">
            <span className="celebration-icon" aria-hidden="true">
              {celebrationType === "accept" ? "✨" : "😊"}
            </span>
            <div className="celebration-text">
              <p className="celebration-title">
                {celebrationType === "accept"
                  ? "Yêu thương đang gửi tới Phi nè!"
                  : "Không được đâu người đẹp"}
              </p>
              <p className="celebration-subtitle">
                {celebrationType === "accept"
                  ? "Chúc Phi một ngày lung linh, ngập tràn điều nhiệm màu 💕"
                  : "Bạn không được phép từ chối hehe 💖"}
              </p>
            </div>
          </div>
        </div>
      )}
      {showSecondCanvas && (
        <>
          <canvas
            className="webgl second-canvas"
            ref={secondCanvasRef}
            aria-hidden="true"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 200,
              cursor: "grab",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 250,
              color: "#ff99cc",
              fontSize: "2rem",
              fontWeight: "bold",
              textShadow: "0 0 20px rgba(255, 153, 204, 0.8)",
              pointerEvents: "none",
              fontFamily: "Dancing Script, cursive",
            }}
          >
            Chúc mừng sinh nhật Phi! 🎂🎉
          </div>
        </>
      )}
    </div>
  );
}

export default App;
