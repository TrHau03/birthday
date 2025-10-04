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
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a0d1a);
    this.clock = new THREE.Clock();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspectRatio = this.width / this.height;

    this.camera = new THREE.PerspectiveCamera(75, this.aspectRatio, 0.1, 100);
    this.camera.position.set(0, 0, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);

    // Mouse interaction variables
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.rotationX = 0;
    this.rotationY = 0;
    this.isMouseDown = false;
    this.mouseDownX = 0;
    this.mouseDownY = 0;

    this.createCake();
    this.addLighting();
    this.addConfetti();
    this.addSparkles();

    this.loop = this.loop.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("touchstart", this.onTouchStart);
    window.addEventListener("touchmove", this.onTouchMove);
    window.addEventListener("touchend", this.onTouchEnd);

    this.disposed = false;
    this.loopId = requestAnimationFrame(this.loop);
  }

  createCake() {
    // Create cake base with gradient effect
    const cakeGeometry = new THREE.CylinderGeometry(2, 2.2, 1.5, 32);
    const cakeMaterial = new THREE.MeshLambertMaterial({
      color: 0xffe6f0,
      transparent: true,
      opacity: 0.9,
    });
    this.cake = new THREE.Mesh(cakeGeometry, cakeMaterial);
    this.cake.position.y = -1;

    // Create second layer with different color
    const secondLayerGeometry = new THREE.CylinderGeometry(1.5, 1.7, 1.2, 32);
    const secondLayerMaterial = new THREE.MeshLambertMaterial({
      color: 0xffb3e6,
      transparent: true,
      opacity: 0.95,
    });
    this.secondLayer = new THREE.Mesh(secondLayerGeometry, secondLayerMaterial);
    this.secondLayer.position.y = 0.1;

    // Create top layer with vibrant color
    const topLayerGeometry = new THREE.CylinderGeometry(1, 1.2, 1, 32);
    const topLayerMaterial = new THREE.MeshLambertMaterial({
      color: 0xff99cc,
      transparent: true,
      opacity: 0.95,
    });
    this.topLayer = new THREE.Mesh(topLayerGeometry, topLayerMaterial);
    this.topLayer.position.y = 1.2;

    // Create detailed candles
    this.candles = [];
    const candleCount = 10; // More candles
    for (let i = 0; i < candleCount; i++) {
      // Create candle base
      const candleGeometry = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8);
      const candleMaterial = new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(i / candleCount, 0.8, 0.7),
      });
      const candle = new THREE.Mesh(candleGeometry, candleMaterial);

      // Create candle wick
      const wickGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.1, 4);
      const wickMaterial = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
      const wick = new THREE.Mesh(wickGeometry, wickMaterial);
      wick.position.y = 0.5;
      candle.add(wick);

      const angle = (i / candleCount) * Math.PI * 2;
      candle.position.x = Math.cos(angle) * 0.9;
      candle.position.z = Math.sin(angle) * 0.9;
      candle.position.y = 2.2;

      // Create enhanced flame
      const flameGeometry = new THREE.SphereGeometry(0.1, 8, 6);
      const flameMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.1, 1, 0.6),
        transparent: true,
        opacity: 0.9,
      });
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.position.y = 0.6;
      flame.scale.set(1, 1.5, 1); // Make flame taller
      candle.add(flame);

      // Create flame glow
      const glowGeometry = new THREE.SphereGeometry(0.15, 8, 6);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.y = 0.6;
      candle.add(glow);

      this.candles.push({ candle, flame, glow, wick });
    }

    // Create detailed decorations
    this.createDetailedDecorations();
  }

  createDetailedDecorations() {
    // Create multiple icing layers
    this.createIcing();
    this.createSprinkles();
    this.createFruits();
    this.createFlowers();
    this.createStars();
  }

  createIcing() {
    // Create swirls around the cake
    const icingGeometry = new THREE.TorusGeometry(1.3, 0.1, 8, 100);
    const icingMaterial = new THREE.MeshLambertMaterial({ color: 0xffccff });
    this.icing = new THREE.Mesh(icingGeometry, icingMaterial);
    this.icing.position.y = 0.6;
    this.icing.rotation.x = Math.PI / 2;
    this.scene.add(this.icing);

    // Create top icing with multiple rings
    const topIcingGeometry = new THREE.TorusGeometry(0.8, 0.08, 8, 100);
    const topIcingMaterial = new THREE.MeshLambertMaterial({ color: 0xff99ff });
    this.topIcing = new THREE.Mesh(topIcingGeometry, topIcingMaterial);
    this.topIcing.position.y = 1.8;
    this.topIcing.rotation.x = Math.PI / 2;

    // Create additional icing details
    const innerIcingGeometry = new THREE.TorusGeometry(0.6, 0.06, 8, 100);
    const innerIcingMaterial = new THREE.MeshLambertMaterial({
      color: 0xffccff,
    });
    this.innerIcing = new THREE.Mesh(innerIcingGeometry, innerIcingMaterial);
    this.innerIcing.position.y = 1.9;
    this.innerIcing.rotation.x = Math.PI / 2;

    // Create bottom icing border
    const bottomIcingGeometry = new THREE.TorusGeometry(2.3, 0.12, 8, 100);
    const bottomIcingMaterial = new THREE.MeshLambertMaterial({
      color: 0xffb3e6,
    });
    this.bottomIcing = new THREE.Mesh(bottomIcingGeometry, bottomIcingMaterial);
    this.bottomIcing.position.y = -0.25;
    this.bottomIcing.rotation.x = Math.PI / 2;

    // Create a group for the entire cake to enable rotation
    this.cakeGroup = new THREE.Group();
    this.cakeGroup.add(this.cake);
    this.cakeGroup.add(this.secondLayer);
    this.cakeGroup.add(this.topLayer);
    this.cakeGroup.add(this.icing);
    this.cakeGroup.add(this.topIcing);
    this.cakeGroup.add(this.innerIcing);
    this.cakeGroup.add(this.bottomIcing);

    // Add candles to the group
    this.candles.forEach(({ candle }) => {
      this.cakeGroup.add(candle);
    });

    // Add decorations to the group (check if arrays exist first)
    if (this.sprinkles) {
      this.sprinkles.forEach((sprinkle) => this.cakeGroup.add(sprinkle));
    }
    if (this.fruits) {
      this.fruits.forEach((fruit) => this.cakeGroup.add(fruit));
    }
    if (this.flowers) {
      this.flowers.forEach((flower) => this.cakeGroup.add(flower));
    }
    if (this.stars) {
      this.stars.forEach((star) => this.cakeGroup.add(star));
    }

    this.scene.add(this.cakeGroup);
  }

  createSprinkles() {
    this.sprinkles = [];
    const sprinkleCount = 30;

    for (let i = 0; i < sprinkleCount; i++) {
      // Create colorful sprinkles
      const sprinkleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6);
      const sprinkleColors = [
        0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xffa07a, 0x98d8c8, 0xf7dc6f,
      ];
      const sprinkleMaterial = new THREE.MeshBasicMaterial({
        color: sprinkleColors[i % sprinkleColors.length],
      });
      const sprinkle = new THREE.Mesh(sprinkleGeometry, sprinkleMaterial);

      // Position sprinkles randomly on cake surfaces
      const layer = Math.floor(Math.random() * 3);
      let y, radius;
      switch (layer) {
        case 0: // Bottom layer
          y = -0.25;
          radius = 1.8 + Math.random() * 0.4;
          break;
        case 1: // Middle layer
          y = 0.7;
          radius = 1.2 + Math.random() * 0.5;
          break;
        case 2: // Top layer
          y = 1.7;
          radius = 0.8 + Math.random() * 0.4;
          break;
      }

      const angle = Math.random() * Math.PI * 2;
      sprinkle.position.x = Math.cos(angle) * radius;
      sprinkle.position.z = Math.sin(angle) * radius;
      sprinkle.position.y = y;

      sprinkle.rotation.z = Math.random() * Math.PI;

      this.sprinkles.push(sprinkle);
      this.scene.add(sprinkle);
    }
  }

  createFruits() {
    this.fruits = [];
    const fruitCount = 12;
    const fruitTypes = [
      { color: 0xff4757, shape: "strawberry" },
      { color: 0x2ed573, shape: "kiwi" },
      { color: 0xffa502, shape: "orange" },
      { color: 0x5f27cd, shape: "grape" },
    ];

    for (let i = 0; i < fruitCount; i++) {
      const fruitType = fruitTypes[i % fruitTypes.length];
      let fruitGeometry;

      if (fruitType.shape === "strawberry") {
        fruitGeometry = new THREE.ConeGeometry(0.08, 0.12, 6);
      } else if (fruitType.shape === "kiwi") {
        fruitGeometry = new THREE.SphereGeometry(0.06, 8, 6);
      } else if (fruitType.shape === "orange") {
        fruitGeometry = new THREE.SphereGeometry(0.08, 8, 6);
      } else {
        fruitGeometry = new THREE.SphereGeometry(0.04, 6, 4);
      }

      const fruitMaterial = new THREE.MeshLambertMaterial({
        color: fruitType.color,
      });
      const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);

      // Position fruits on cake sides
      const layer = Math.floor(Math.random() * 3);
      let y, radius;
      switch (layer) {
        case 0: // Bottom layer
          y = -0.25;
          radius = 2.1;
          break;
        case 1: // Middle layer
          y = 0.7;
          radius = 1.6;
          break;
        case 2: // Top layer
          y = 1.7;
          radius = 1.1;
          break;
      }

      const angle = (i / fruitCount) * Math.PI * 2;
      fruit.position.x = Math.cos(angle) * radius;
      fruit.position.z = Math.sin(angle) * radius;
      fruit.position.y = y;

      this.fruits.push(fruit);
      this.scene.add(fruit);
    }
  }

  createFlowers() {
    this.flowers = [];
    const flowerCount = 8;

    for (let i = 0; i < flowerCount; i++) {
      // Create flower petals
      const petalGeometry = new THREE.SphereGeometry(0.04, 6, 4);
      const flowerGroup = new THREE.Group();

      // Create 5 petals for each flower
      for (let j = 0; j < 5; j++) {
        const petalMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.8 + Math.random() * 0.2, 0.7, 0.8),
        });
        const petal = new THREE.Mesh(petalGeometry, petalMaterial);

        const angle = (j / 5) * Math.PI * 2;
        petal.position.x = Math.cos(angle) * 0.08;
        petal.position.z = Math.sin(angle) * 0.08;
        petal.scale.set(1, 0.3, 1);

        flowerGroup.add(petal);
      }

      // Create flower center
      const centerGeometry = new THREE.SphereGeometry(0.02, 6, 4);
      const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      const center = new THREE.Mesh(centerGeometry, centerMaterial);
      flowerGroup.add(center);

      // Position flowers on cake top
      const angle = (i / flowerCount) * Math.PI * 2;
      flowerGroup.position.x = Math.cos(angle) * 0.6;
      flowerGroup.position.z = Math.sin(angle) * 0.6;
      flowerGroup.position.y = 2.0;

      this.flowers.push(flowerGroup);
      this.scene.add(flowerGroup);
    }
  }

  createStars() {
    this.stars = [];
    const starCount = 6;

    for (let i = 0; i < starCount; i++) {
      // Create star shape using multiple spheres
      const starGroup = new THREE.Group();

      // Create 5 points for each star
      for (let j = 0; j < 5; j++) {
        const pointGeometry = new THREE.ConeGeometry(0.02, 0.08, 3);
        const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });
        const point = new THREE.Mesh(pointGeometry, pointMaterial);

        const angle = (j / 5) * Math.PI * 2;
        point.position.x = Math.cos(angle) * 0.06;
        point.position.z = Math.sin(angle) * 0.06;
        point.rotation.z = angle + Math.PI / 2;

        starGroup.add(point);
      }

      // Create star center
      const centerGeometry = new THREE.SphereGeometry(0.03, 6, 4);
      const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xffed4e });
      const center = new THREE.Mesh(centerGeometry, centerMaterial);
      starGroup.add(center);

      // Position stars around the cake
      const layer = Math.floor(Math.random() * 2) + 1; // Middle and top layers
      let y, radius;
      switch (layer) {
        case 1: // Middle layer
          y = 0.7;
          radius = 1.6;
          break;
        case 2: // Top layer
          y = 1.7;
          radius = 1.1;
          break;
      }

      const angle = (i / starCount) * Math.PI * 2;
      starGroup.position.x = Math.cos(angle) * radius;
      starGroup.position.z = Math.sin(angle) * radius;
      starGroup.position.y = y;

      this.stars.push(starGroup);
      this.scene.add(starGroup);
    }
  }

  addSparkles() {
    this.sparkles = [];
    const sparkleCount = 50;
    const sparkleGeometry = new THREE.SphereGeometry(0.02, 8, 6);

    for (let i = 0; i < sparkleCount; i++) {
      const sparkleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
      });
      const sparkle = new THREE.Mesh(sparkleGeometry, sparkleMaterial);

      sparkle.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 6 - 1,
        (Math.random() - 0.5) * 8
      );

      this.sparkles.push({
        mesh: sparkle,
        originalY: sparkle.position.y,
        speed: Math.random() * 0.02 + 0.01,
        amplitude: Math.random() * 0.5 + 0.3,
        phase: Math.random() * Math.PI * 2,
      });

      this.scene.add(sparkle);
    }
  }

  addLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);

    // Point lights for candles
    this.candleLights = [];
    this.candles.forEach(({ candle }) => {
      const light = new THREE.PointLight(0xff6600, 0.5, 3);
      light.position.copy(candle.position);
      light.position.y += 0.5;
      this.scene.add(light);
      this.candleLights.push(light);
    });
  }

  addConfetti() {
    this.confetti = [];
    const confettiCount = 100;
    const confettiGeometry = new THREE.PlaneGeometry(0.1, 0.1);

    for (let i = 0; i < confettiCount; i++) {
      const confettiMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
        transparent: true,
        opacity: 0.8,
      });
      const confettiPiece = new THREE.Mesh(confettiGeometry, confettiMaterial);

      confettiPiece.position.set(
        (Math.random() - 0.5) * 10,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 10
      );

      confettiPiece.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      this.confetti.push({
        mesh: confettiPiece,
        velocity: {
          x: (Math.random() - 0.5) * 0.02,
          y: -Math.random() * 0.05,
          z: (Math.random() - 0.5) * 0.02,
        },
        rotation: {
          x: (Math.random() - 0.5) * 0.1,
          y: (Math.random() - 0.5) * 0.1,
          z: (Math.random() - 0.5) * 0.1,
        },
      });

      this.scene.add(confettiPiece);
    }
  }

  loop() {
    if (this.disposed) return;

    const elapsedTime = this.clock.getElapsedTime();
    const deltaTime = this.clock.getDelta();

    // Smooth rotation interpolation
    this.rotationX += (this.targetRotationX - this.rotationX) * 0.1;
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;

    // Apply rotation to the cake group
    this.cakeGroup.rotation.y = this.rotationY;
    this.cakeGroup.rotation.x = this.rotationX;

    // Subtle automatic rotation when not interacting
    if (!this.isMouseDown) {
      this.targetRotationY += deltaTime * 0.2;
    }

    // Animate candles with enhanced effects
    this.candles.forEach(({ candle, flame, glow, wick }, index) => {
      const time = elapsedTime * 5 + index;
      flame.scale.y = 1 + Math.sin(time) * 0.3;
      flame.scale.x = 1 + Math.sin(time * 1.5) * 0.1;
      flame.scale.z = 1 + Math.sin(time * 1.5) * 0.1;
      flame.rotation.z = Math.sin(time * 3) * 0.1;
      flame.rotation.x = Math.sin(time * 2) * 0.05;

      // Flickering effect
      flame.material.opacity = 0.6 + Math.sin(time * 10) * 0.3;
      glow.material.opacity = 0.2 + Math.sin(time * 8) * 0.1;

      // Wick animation
      wick.rotation.z = Math.sin(time * 2) * 0.05;
    });

    // Animate sparkles
    this.sparkles.forEach((sparkle) => {
      sparkle.mesh.position.y =
        sparkle.originalY +
        Math.sin(elapsedTime * sparkle.speed + sparkle.phase) *
          sparkle.amplitude;
      sparkle.mesh.rotation.y += 0.02;
      sparkle.mesh.rotation.x += 0.01;

      // Twinkling effect
      sparkle.mesh.material.opacity =
        0.5 + Math.sin(elapsedTime * 3 + sparkle.phase) * 0.3;
    });

    // Animate confetti with physics
    this.confetti.forEach((confetti) => {
      confetti.mesh.position.x += confetti.velocity.x;
      confetti.mesh.position.y += confetti.velocity.y;
      confetti.mesh.position.z += confetti.velocity.z;

      confetti.mesh.rotation.x += confetti.rotation.x;
      confetti.mesh.rotation.y += confetti.rotation.y;
      confetti.mesh.rotation.z += confetti.rotation.z;

      // Add gravity
      confetti.velocity.y -= 0.001;

      // Reset confetti when it falls too low
      if (confetti.mesh.position.y < -3) {
        confetti.mesh.position.y = 5;
        confetti.mesh.position.x = (Math.random() - 0.5) * 10;
        confetti.mesh.position.z = (Math.random() - 0.5) * 10;
        confetti.velocity.y = -Math.random() * 0.05;
      }
    });

    // Enhanced camera movement
    if (!this.isMouseDown) {
      this.camera.position.x = Math.sin(elapsedTime * 0.3) * 0.5;
      this.camera.position.y = Math.sin(elapsedTime * 0.2) * 0.3;
    }
    this.camera.lookAt(this.scene.position);

    // Animate icing decorations
    this.icing.rotation.z += deltaTime * 0.3;
    this.topIcing.rotation.z += deltaTime * 0.4;
    this.innerIcing.rotation.z += deltaTime * 0.2;
    this.bottomIcing.rotation.z += deltaTime * 0.1;

    // Animate decorations (check if arrays exist first)
    if (this.sprinkles) {
      this.sprinkles.forEach((sprinkle, index) => {
        sprinkle.rotation.y += deltaTime * (0.5 + index * 0.1);
        sprinkle.rotation.z += deltaTime * 0.3;
      });
    }

    if (this.fruits) {
      this.fruits.forEach((fruit, index) => {
        fruit.rotation.y += deltaTime * 0.2;
        fruit.position.y += Math.sin(elapsedTime * 2 + index) * 0.001;
      });
    }

    if (this.flowers) {
      this.flowers.forEach((flower, index) => {
        flower.rotation.y += deltaTime * 0.1;
        flower.children.forEach((petal, petalIndex) => {
          petal.rotation.x += deltaTime * (0.2 + petalIndex * 0.1);
        });
      });
    }

    if (this.stars) {
      this.stars.forEach((star, index) => {
        star.rotation.y += deltaTime * 0.3;
        star.children.forEach((point) => {
          point.rotation.z += deltaTime * 0.5;
        });
      });
    }

    this.renderer.render(this.scene, this.camera);
    this.loopId = requestAnimationFrame(this.loop);
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  onMouseMove(event) {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;

    if (this.isMouseDown) {
      const deltaX = event.clientX - this.mouseDownX;
      const deltaY = event.clientY - this.mouseDownY;

      this.targetRotationY += deltaX * 0.01;
      this.targetRotationX += deltaY * 0.01;

      // Limit vertical rotation
      this.targetRotationX = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, this.targetRotationX)
      );

      this.mouseDownX = event.clientX;
      this.mouseDownY = event.clientY;
    }
  }

  onMouseDown(event) {
    this.isMouseDown = true;
    this.mouseDownX = event.clientX;
    this.mouseDownY = event.clientY;
    this.canvas.style.cursor = "grabbing";
  }

  onMouseUp(event) {
    this.isMouseDown = false;
    this.canvas.style.cursor = "grab";
  }

  onTouchStart(event) {
    event.preventDefault();
    if (event.touches.length === 1) {
      this.isMouseDown = true;
      this.mouseDownX = event.touches[0].clientX;
      this.mouseDownY = event.touches[0].clientY;
    }
  }

  onTouchMove(event) {
    event.preventDefault();
    if (event.touches.length === 1 && this.isMouseDown) {
      const deltaX = event.touches[0].clientX - this.mouseDownX;
      const deltaY = event.touches[0].clientY - this.mouseDownY;

      this.targetRotationY += deltaX * 0.01;
      this.targetRotationX += deltaY * 0.01;

      // Limit vertical rotation
      this.targetRotationX = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, this.targetRotationX)
      );

      this.mouseDownX = event.touches[0].clientX;
      this.mouseDownY = event.touches[0].clientY;
    }
  }

  onTouchEnd(event) {
    event.preventDefault();
    this.isMouseDown = false;
  }

  dispose() {
    this.disposed = true;
    if (this.loopId) {
      cancelAnimationFrame(this.loopId);
    }
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchEnd);
    if (this.renderer) {
      this.renderer.dispose();
    }
    this.scene.clear();
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
