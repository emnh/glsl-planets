/*jslint browser: true, es6: true */

/*global
  $, THREE, Stats, dat, sweetAlert
*/

// noprotect

// babel will add it for us
// 'use strict';

const Config = function() {
  this.planetCount = 5;
  this.starCount = 25;
  this.maxSpeed = 1.00;
  this.minSpeed = 0.001;
  this.distReduction = 30;
  this.minDist = 1.0;
  this.starDistReduction = 30;
  this.speedReduction = 100.0;
  this.starSpeedReduction = 0.1;
  this.trailLength = 100;
  this.starTrailLength = 1;
  this.randomWalk = false;
  this.randomWalkScale = 1.0;
  this.useParentColor = true;
  this.useBackBuffer = false;
  this.useShader = true;
  this.useTubes = false;
  this.tubeSegments = 20;
  this.useBufferGeometry = false;
  this.useParticles = true;
  this.particleInterpolation = 10.0;
  this.useMeshes = !this.useBufferGeometry && !this.useTubes && !this.useParticles;
  this.useParticleTrail = true;
  this.usePTrailOpacity = false;
  this.radiusScale = 0.4;
  this.usePlanetRadius = false;
  this.scale = 20;
  this.starScale = 1.0 / this.scale;
  this.useZ = false;
  this.maxX = this.scale / 2.0 * window.innerWidth / window.innerHeight;
  this.maxY = this.scale / 2.0;
  this.maxZ = this.scale;
};
window.planetsConfig = new Config();

const gpgpuVersion = false;

const ComputeShader = function() {
  const sq = Math.ceil(Math.sqrt(window.planetsState.planets.length));
  const th = sq;
  const floatsPerPlanet = 4.0;
  const tw = sq;
  const outHeight = sq;
  const outWidth = sq;

  this.renderer = new THREE.WebGLRenderer();
  this.renderer.setSize(outWidth, outHeight);
  // XXX: for debug only
  document.body.appendChild(this.renderer.domElement);

  this.camera = new THREE.Camera();
  this.camera.position.z = 1;

  // Init RTT stuff
  const gl = this.renderer.getContext();

  if (!gl.getExtension('OES_texture_float')) {
    sweetAlert('No OES_texture_float support for float textures!', 'error');
    return;
  }

  if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) === 0) {
    sweetAlert('No support for vertex shader textures!', 'error');
    return;
  }

  this.scene = new THREE.Scene();

  const defines = {
    SQPLANET: sq,
    VEC4PERPLANET: floatsPerPlanet
  };

  this.uniforms = {
    speedReduction: { type: 'f', value: window.planetsConfig.speedReduction * 10.0 },
    planetCount: { type: 'f', value: window.planetsConfig.planetCount },
    minDist: { type: 'f', value: window.planetsConfig.minDist },
    distReduction: { type: 'f', value: window.planetsConfig.distReduction },
    texturePositions: { type: 't', value: null },
    textureVelocities: { type: 't', value: null },
    resolution: { type: 'v2', value: new THREE.Vector2(tw, th) }
  };

  this.uniformsPassThrough = {
    passTexture: { type: 't', value: null },
    resolution: { type: 'v2', value: new THREE.Vector2(tw, th) }
  };

  this.passThroughMaterial =
    new THREE.ShaderMaterial({
      defines: defines,
      uniforms: this.uniformsPassThrough,
      vertexShader: $('#vertexShaderPassThrough').text(),
      fragmentShader: $('#fragmentShaderPassThrough').text(),
      depthWrite: false
    });

  this.velocityMaterial =
    new THREE.ShaderMaterial({
      defines: defines,
      uniforms: this.uniforms,
      vertexShader: $('#vertexShaderPassThrough').text(),
      fragmentShader: $('#fragmentShaderVelocity').text(),
      depthWrite: false
    });

  this.positionMaterial =
    new THREE.ShaderMaterial({
      defines: defines,
      uniforms: this.uniforms,
      vertexShader: $('#vertexShaderPassThrough').text(),
      fragmentShader: $('#fragmentShaderPosition').text(),
      depthWrite: false
    });

  const plane = new THREE.PlaneBufferGeometry(2, 2);
  this.mesh = new THREE.Mesh(plane, this.passThroughMaterial);
  // this.mesh.position.z = -1;
  this.scene.add(this.mesh);

  const compute = this;

  this.screen = new function() {
    this.screenScene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 1;

    const controls = new THREE.OrbitControls(this.camera, compute.renderer.domElement);

    this.geometry = new THREE.Geometry();

    const sphere = new THREE.SphereGeometry( 0.01, 50, 50);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        texturePositions: { type: 't', value: null },
        opacity: { type: 'f', value: 1.0 },
        resolution: { type: 'v2', value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        udisplacementIndex: { type: 'v2', value: null, needsUpdate: true },
        upcolor: { type: 'c', value: null, needsUpdate: true }
      },
      attributes: {
        displacementIndex: { type: 'v2', value: [], needsUpdate: true },
        pcolor: { type: 'c', value: [], needsUpdate: true }
      },
      vertexShader: $('#vertexShaderFromPositions').text(),
      fragmentShader: $('#fragmentshaderParticles').text(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.geoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        texturePositions: { type: 't', value: null },
        opacity: { type: 'f', value: 1.0 },
        resolution: { type: 'v2', value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        udisplacementIndex: { type: 'v2', value: null, needsUpdate: true },
        color: { type: 'c', value: null, needsUpdate: true },
        time: { type: 'f', value: 0.0, needsUpdate: true }
      },
      attributes: {
      },
      vertexShader: $('#vertexShaderFromPositionsGeo').text(),
      fragmentShader: $('#fragmentshader2').text(),
      transparent: false
    });

    const smat = new THREE.MeshPhongMaterial({
      color: 0x2194ce,
      bumpScale: 1,
      specular: 0x111111,
      shininess: 50,
      shading: THREE.SmoothShading
    });

    const vertices = this.geometry.vertices;
    const pColor = this.material.attributes.pcolor.value;
    const displacementIndex = this.material.attributes.displacementIndex.value;

    const materials = [];
    this.materials = materials;
    const meshes = [];

    for (let x = 0; x < tw; x++) {
      for (let y = 0; y < th; y++) {
        const xf = x / tw;
        const yf = y / th;
        const pt = new THREE.Vector2(xf, yf);
        const r = Math.random();
        const g = Math.random();
        const b = Math.random();
        const color = new THREE.Color(r, g, b);

        if (window.planetsConfig.useMeshes) {
          const material = this.geoMaterial.clone();
          material.uniforms.udisplacementIndex.value = pt;
          material.uniforms.color.value = color;
          materials.push(material);
          const mesh = new THREE.Mesh(sphere, material);
          const scale = 1.0;
          mesh.scale.x = scale;
          mesh.scale.y = scale;
          mesh.scale.z = scale;
          meshes.push(mesh);
          this.screenScene.add(mesh);
        }
        if (window.planetsConfig.useParticles) {
          vertices.push(new THREE.Vector3(0.0, 0.0, 0.0));
          displacementIndex.push(pt);
          pColor.push(color);
        }
      }
    }

    // const material = new THREE.PointCloudMaterial( { size: 1, sizeAttenuation: false, alphaTest: 0.5, transparent: true } );

    if (window.planetsConfig.useParticles) {
      this.particleCloud = new THREE.PointCloud(this.geometry, this.material);
      this.screenScene.add(this.particleCloud);
    }
    this.screenScene.add(new THREE.AmbientLight(0x444444));
  }();

  const rt =
    new THREE.WebGLRenderTarget(tw, tw, {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false
    });
  this.rtPositions1 = rt.clone();
  this.rtPositions2 = rt.clone();
  this.rtVelocities1 = rt.clone();
  this.rtVelocities2 = rt.clone();

  this.genTexture = function() {
    const rgbaSize = 4;
    const rawPositions = new Float32Array(tw * th * rgbaSize);
    const rawVelocities = new Float32Array(tw * th * rgbaSize);
    for (let planet of window.planetsState.planets) {
      let i = planet.index * floatsPerPlanet;
      const position = planet.position;
      const p = {
        x: (position.x + 1.0) / 2.0,
        y: (position.y + 1.0) / 2.0,
        z: (position.z + 1.0) / 2.0
      };
      const v = {
        x: (planet.velocity.x + 1.0) / 2.0,
        y: (planet.velocity.y + 1.0) / 2.0,
        z: (planet.velocity.z + 1.0) / 2.0
      };
      rawPositions[i++] = p.x;
      rawPositions[i++] = p.y;
      rawPositions[i++] = p.z;
      rawPositions[i++] = 0.0;
      rawVelocities[i++] = v.x;
      rawVelocities[i++] = v.y;
      rawVelocities[i++] = v.z;
      rawVelocities[i++] = 0.0;
    }

    const tPositions = new THREE.DataTexture(rawPositions, tw, th, THREE.RGBAFormat, THREE.FloatType);
    tPositions.minFilter = THREE.NearestFilter;
    tPositions.wrapS = THREE.ClampToEdgeWrapping;
    tPositions.wrapT = THREE.ClampToEdgeWrapping;
    tPositions.needsUpdate = true;

    const tVelocities = new THREE.DataTexture(rawVelocities, tw, th, THREE.RGBAFormat, THREE.FloatType);
    tVelocities.minFilter = THREE.NearestFilter;
    tVelocities.wrapS = THREE.ClampToEdgeWrapping;
    tVelocities.wrapT = THREE.ClampToEdgeWrapping;
    tVelocities.needsUpdate = true;

    return [tPositions, tVelocities];
  };

  this.getImageData = function(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    return context.getImageData(0, 0, image.width, image.height);
  };

  this.render = function() {
    // set input textures from last round
    this.uniforms.texturePositions.value = this.rtPositions2;
    this.uniforms.textureVelocities.value = this.rtVelocities2;
    if (window.planetsConfig.useMeshes) {
      const newTime = (new Date().getTime()) / 1000.0;
      for (let material of this.screen.materials) {
        material.uniforms.texturePositions.value = this.rtPositions2;
        material.uniforms.time.value = newTime - window.planetsState.startTime;
      }
    }

    // update velocities
    this.mesh.material = this.velocityMaterial;
    this.renderer.render(this.scene, this.camera, this.rtVelocities1, true);

    // update positions
    this.mesh.material = this.positionMaterial;
    this.renderer.render(this.scene, this.camera, this.rtPositions1, true);

    // render to screen
    /*
    this.mesh.material = this.passThroughMaterial;
    this.uniformsPassThrough.passTexture.value = this.rtPositions2;
    this.renderer.render(this.scene, this.camera); //, null, true);
    */
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.render(this.screen.screenScene, this.screen.camera);

    // swap buffers
    [this.rtVelocities1, this.rtVelocities2] = [this.rtVelocities2, this.rtVelocities1];
    [this.rtPositions1, this.rtPositions2] = [this.rtPositions2, this.rtPositions1];

    window.planetsState.stats.update();
    requestAnimationFrame(() => this.render());
  };

  this.compute = function() {
    const [tPositions, tVelocities] = this.genTexture();

    // copy positions texture
    this.uniformsPassThrough.passTexture.value = tPositions;
    this.mesh.material = this.passThroughMaterial;
    this.renderer.render(this.scene, this.camera, this.rtPositions1, true);
    this.renderer.render(this.scene, this.camera, this.rtPositions2, true);

    // copy velocities texture
    this.uniformsPassThrough.passTexture.value = tVelocities;
    this.mesh.material = this.passThroughMaterial;
    this.renderer.render(this.scene, this.camera, this.rtVelocities1, true);
    this.renderer.render(this.scene, this.camera, this.rtVelocities2, true);

    this.render();

    // const img = this.getImageData(this.renderer.domElement);
  };
};


const MeshMaker = function(shader) {
  const scale = 1.0;
  const length = 1.0;
  // this.geometry = new THREE.BoxGeometry( 1/scale, 1/scale, 1/scale );
  // this.geometry = new THREE.TorusGeometry(0.5/scale, 0.25/scale, 16, 100);
  // this.geometry = new THREE.SphereGeometry( 0.03, 50, 50);
  this.geometry = new THREE.SphereGeometry( 0.3 / scale, 50, 50);

  // this.geometry = new THREE.CylinderGeometry( 0.3, 0.3, length, 50);
  // rotates the cylinder to initial position so it will rotate correctly with velocity
  // this.geometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, length / 2, 0 ) );
  // this.geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / 2 ) );

  // this.geometry = new THREE.IcosahedronGeometry(0.1);

  this.initMaterial = function() {
    const imgTexture = THREE.ImageUtils.loadTexture( 'textures/sprite.png');
    // imgTexture.repeat.set( 1, 1 );
    // imgTexture.wrapS = imgTexture.wrapT = THREE.RepeatWrapping;
    // imgTexture.anisotropy = 16;
    this.imgTexture = imgTexture;

    const shininess = 50;
    const specular = 0x111111;
    const bumpScale = 1;
    const shading = THREE.SmoothShading;

    const imgTexture2 = THREE.ImageUtils.loadTexture( 'textures/moon_1024.jpg');
    imgTexture2.wrapS = imgTexture2.wrapT = THREE.RepeatWrapping;
    imgTexture2.anisotropy = 16;
    this.imgTexture2 = imgTexture2;

    // this.material = new THREE.MeshPhongMaterial( { map: imgTexture, bumpMap: imgTexture, bumpScale: bumpScale, color: 0xffffff, specular: specular, shininess: shininess, shading: shading } );
    this.material = new THREE.MeshPhongMaterial({
      color: 0x2194ce,
      bumpScale: bumpScale,
      specular: specular,
      shininess: shininess,
      shading: shading
    });
  };

  this.initMaterial();

  this.initShader = function() {
    this.shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { type: 'f', value: 0.0 },
        resolution: { type: 'v2', value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        color: { type: 'c', value: new THREE.Color(1.0, 1.0, 1.0) },
        material: { type: 't', value: this.imgTexture }
      },
      vertexShader: $('#vertexshader').text(),
      fragmentShader: shader,
      transparent: true
    });
  };

  this.createMesh = function() {
    const mesh =
      window.planetsConfig.useShader ?
        new THREE.Mesh(this.geometry, this.shaderMaterial.clone()) :
        new THREE.Mesh(this.geometry, this.material.clone());
    return mesh;
  };
};

MeshMaker.createMeshMaker = function(fragmentId) {
  const shader = $(fragmentId).text();
  const meshMaker = new MeshMaker(shader);
  meshMaker.initShader();
  return meshMaker;
};

const randInit = function() {
  return Math.random() * 2.0 - 1.0;
};

const createPlanet = function(index) {
  const planet = {
    index: index,
    position: {
      x: randInit(),
      y: randInit(),
      z: randInit()
    },
    velocity: {
      x: randInit() * window.planetsConfig.maxSpeed,
      y: randInit() * window.planetsConfig.maxSpeed,
      z: randInit() * window.planetsConfig.maxSpeed
    },
    mass: Math.random(),
    radius: Math.random(),
    positions: [],
    maxPositions: window.planetsConfig.trailLength,
    meshes: [],
    lastMesh: 0,
    color: {
      r: Math.random(),
      g: Math.random(),
      b: Math.random()
    },
    color2: {
      r: Math.random(),
      g: Math.random(),
      b: Math.random()
    },
    isStar: false,
    speed: 0.0
  };
  return planet;
};

const createStars = function() {
  const starPlanets = [];
  let index = window.planetsState.planets.length;
  for (let planet of window.planetsState.planets) {
    if (planet.isStar) {
      continue;
    }
    if (planet.stars === undefined) {
      planet.stars = [];
    }
    for (let s = planet.stars.length; s < window.planetsConfig.starCount; s++) {
      const star = createPlanet(index);
      starPlanets.push(star);
      star.parent = planet;
      star.radius = planet.radius * 0.5;
      star.mass = 1.0;
      star.isStar = true;
      star.maxPositions = window.planetsConfig.starTrailLength;
      planet.stars.push(star);
      for (let t = 0; t < window.planetsConfig.starTrailLength; t++) {
        const mesh = window.planetsState.meshMakers[star.index % window.planetsState.meshMakers.length].createMesh();
        star.meshes.push(mesh);
      }
      index += 1;
    }
  }
  for (let star of starPlanets) {
    window.planetsState.planets.push(star);
  }
};

const createPlanets = function() {
  const planetCount = window.planetsState.planets.filter((p) => !p.isStar).length;

  for (let i = planetCount; i < window.planetsConfig.planetCount; i++) {
    const planet = createPlanet(window.planetsState.planets.length);
    window.planetsState.planets.push(planet);
    if (window.planetsConfig.useTubes) {
      planet.tubeMaterial = window.planetsState.meshMakers[planet.index % window.planetsState.meshMakers.length].shaderMaterial.clone();
      //planet.tubeMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    }
    for (let t = 0; t < window.planetsConfig.trailLength; t++) {
      const mesh = window.planetsState.meshMakers[planet.index % window.planetsState.meshMakers.length].createMesh();
      planet.meshes.push(mesh);
    }
  }

  createStars();
};

const createEdges = function() {
  window.planetsState.edges = [];
  const planetsNoStars = window.planetsState.planets.filter((p) => !p.isStar);
  for (let p1 of planetsNoStars) {
    // add planet edges
    for (let p2 of planetsNoStars) {
      if (p1 === p2) {
        continue;
      }
      const w = 1.0;
      const edge = [p1, p2, w];
      window.planetsState.edges.push(edge);
    }

    // add star edges
    for (let p3 of p1.stars) {
      for (let p4 of p1.stars) {
        if (p3 === p4) {
          continue;
        }
        const w = 1.0;
        const edge = [p3, p4, w];
        window.planetsState.edges.push(edge);
      }
    }
  }
};

const createWalls = function() {
  const planeGeo = new THREE.PlaneGeometry(window.planetsConfig.scale * 2.0 + 0.1, window.planetsConfig.scale * 2.0 + 0.1);

  // const wallColor = 0x111111;
  const wallColor = 0xffffff;

  const walls = [];

  const planeTop = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeTop.position.y = window.planetsConfig.maxY;
  planeTop.rotateX(Math.PI / 2);
  walls.push(planeTop);

  const planeBottom = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeBottom.position.y = -window.planetsConfig.maxY;
  planeBottom.rotateX(-Math.PI / 2);
  walls.push(planeBottom);

  const planeBack = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeBack.position.z = -window.planetsConfig.maxZ;
  planeBack.position.y = 0.0;
  walls.push(planeBack);

  const planeFront = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeFront.position.z = window.planetsConfig.maxZ;
  planeFront.position.y = 0.0;
  planeFront.rotateY(Math.PI);
  walls.push(planeFront);

  const planeRight = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeRight.position.x = window.planetsConfig.maxX;
  planeRight.position.y = 0.0;
  planeRight.rotateY(-Math.PI / 2);
  walls.push(planeRight);

  const planeLeft = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeLeft.position.x = -window.planetsConfig.maxX;
  planeLeft.position.y = 0.0;
  planeLeft.rotateY(Math.PI / 2);
  walls.push(planeLeft);

  return walls;
};

const createLights = function() {
  const lights = [];
  const mainLight = new THREE.PointLight( 0xffffff, 1.5, 250 );
  mainLight.position.set(0.0, 0.0, window.planetsConfig.maxZ);
  lights.push(mainLight);
  return lights;
};


const clamp = function(num, min, max) {
  const maxed = num > max ? max : num;
  return num < min ? min : maxed;
};

const reflect = function(reduction, position, speed) {
  const sr = speed / reduction;
  let retVal;
  if (position + sr <= -1.0 ||
      position + sr >= 1.0) {
    if (position - sr <= -1.0 ||
        position - sr >= 1.0) {
      retVal = [position, 0.0];
    } else {
      retVal = [position - sr, -speed];
    }
  } else {
    retVal = [position + sr, speed];
  }
  return retVal;
};

const max = function(a, b) {
  return a > b ? a : b;
};

const min = function(a, b) {
  return a < b ? a : b;
};

const euclid = function(p1, p2) {
  const x = p2.x - p1.x;
  const y = p2.y - p1.y;
  const z = p2.z - p1.z;
  const distSquare = x * x + y * y + z * z;
  const ret = {
    distSquare,
    x: x,
    y: y,
    z: z,
    dist: Math.sqrt(distSquare)
  };
  return ret;
};

const updatePlanets = function() {
  const vs = [];
  for (let p of window.planetsState.planets) {
    const ve = {
      x: 0.0,
      y: 0.0,
      z: 0.0
    };
    vs[p.index] = ve;
  }

  // compute new velocities
  for (let edge of window.planetsState.edges) {
    const [p1, p2, w] = edge;
    const diff = euclid(p1.position, p2.position);
    const dist = diff.distSquare;
    let F = p1.mass * p2.mass * w;
    if (p1.isStar || p2.isStar) {
      F = 1.0 / (window.planetsConfig.minDist + dist) / window.planetsConfig.starDistReduction / window.planetsConfig.starCount;
    } else {
      F = 1.0 / (window.planetsConfig.minDist + dist) / window.planetsConfig.distReduction / window.planetsConfig.planetCount;
    }
    vs[p1.index].x += (diff.x * F);
    vs[p1.index].y += (diff.y * F);
    vs[p1.index].z += (diff.z * F);
  }

  // adjust velocities
  for (let planet of window.planetsState.planets) {
    const v = vs[planet.index];

    // add random walk
    if (window.planetsConfig.randomWalk && !planet.isStar) {
      const rf = window.planetsConfig.randomWalkScale;
      v.x += randInit() / rf;
      v.y += randInit() / rf;
      v.z += randInit() / rf;
    }

    planet.velocity.x += v.x;
    planet.velocity.y += v.y;
    planet.velocity.z += v.z;

    // limit speed
    const speed = Math.sqrt(planet.velocity.x * planet.velocity.x +
                        planet.velocity.y * planet.velocity.y +
                        planet.velocity.z * planet.velocity.z
                       );
    planet.speed = speed;
    if (speed > window.planetsConfig.maxSpeed) {
      planet.velocity.x *= (window.planetsConfig.maxSpeed / speed);
      planet.velocity.y *= (window.planetsConfig.maxSpeed / speed);
      planet.velocity.z *= (window.planetsConfig.maxSpeed / speed);
      planet.speed = window.planetsConfig.maxSpeed;
    } else if (speed < window.planetsConfig.minSpeed) {
      planet.velocity.x *= (window.planetsConfig.minSpeed / speed);
      planet.velocity.y *= (window.planetsConfig.minSpeed / speed);
      planet.velocity.z *= (window.planetsConfig.minSpeed / speed);
      planet.speed = window.planetsConfig.minSpeed;
    }
  }

  // update positions
  for (let planet of window.planetsState.planets) {
    // store old position
    if (window.planetsConfig.useTubes) {
      planet.positions.push({
        x: planet.position.x,
        y: planet.position.y,
        z: planet.position.z
      });
      if (planet.positions.length > planet.maxPositions) {
        planet.positions.shift();
      }
    }

    // compute new
    const reduction = planet.isStar ? window.planetsConfig.starSpeedReduction : window.planetsConfig.speedReduction;
    [planet.position.x, planet.velocity.x] = reflect(reduction, planet.position.x, planet.velocity.x);
    [planet.position.y, planet.velocity.y] = reflect(reduction, planet.position.y, planet.velocity.y);
    [planet.position.z, planet.velocity.z] = reflect(reduction, planet.position.z, planet.velocity.z);
  }
};

const Particles = function() {
  const geometry = new THREE.Geometry();

  const material =
    new THREE.ShaderMaterial({
      uniforms: {
        opacity: { type: 'f', value: 1.0 }
      },
      attributes: {
        psize: { type: 'f', value: [], needsUpdate: true },
        pcolor: { type: 'c', value: [], needsUpdate: true },
        pcolor2: { type: 'c', value: [], needsUpdate: true }
      },
      vertexShader: $('#vertexshaderParticles').text(),
      fragmentShader: $('#fragmentshaderParticles').text(),
      // blending: THREE.AdditiveBlending,
      // blending: THREE.MultiplyBlending,
      depthWrite: false,
      transparent: true
    });
  // material = new THREE.PointCloudMaterial( { size: 35, sizeAttenuation: false, alphaTest: 0.5, transparent: true } );
  const particleCloud = new THREE.PointCloud(geometry, material);

  this.setOpacity = function(o) {
    material.uniforms.opacity.value = o;
  };

  this.add = function(pt, size, color, color2) {
    const vertices = geometry.vertices;
    const idx = vertices.length;
    vertices.push(pt);
    const vsize = material.attributes.psize.value;
    const vcolor = material.attributes.pcolor.value;
    const vcolor2 = material.attributes.pcolor2.value;
    vsize[idx] = size;
    vcolor[idx] = color;
    vcolor2[idx] = color2;
  };

  this.addPlanet = function(planet, pos) {
    const size =
      window.planetsConfig.radiusScale * 20.0 *
        (window.planetsConfig.usePlanetRadius ? planet.radius : 1.0);
    const color =
      (planet.isStar && window.planetsConfig.useParentColor) ?
        planet.parent.color : planet.color;
    if (planet.oldParticlePos !== undefined && window.planetsConfig.particleInterpolation > 0.0) {
      const p1 = planet.oldParticlePos;
      const p2 = pos;
      const diff = euclid(p1, p2);
      const dist = diff.dist;
      const maxI = window.planetsConfig.particleInterpolation * dist;
      for (let i = 1; i <= maxI; i++) {
        const scale = i / maxI;
        const p3 = {
          x: p1.x + diff.x * scale,
          y: p1.y + diff.y * scale,
          z: p1.z + diff.z * scale
        };
        const v3 = new THREE.Vector3(p3.x, p3.y, p3.z);
        this.add(v3, size, color, planet.color2);
      }
    }
    this.add(new THREE.Vector3(pos.x, pos.y, pos.z), size, color, planet.color2);
    planet.oldParticlePos = pos;
  }

  this.addToScene = function(scene) {
    scene.add(particleCloud);
  };

  this.removeFromScene = function(scene) {
    scene.remove(particleCloud);
    geometry.dispose();
    material.dispose();
  };
};

const BufferGeometry = function() {
  const geometry = new THREE.BufferGeometry();

  let length = 0;
  const stepSize = 1000;

  let vertices = new Float32Array(0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: THREE.VertexColors,
    linewidth: 1.0
  });
  const mesh = new THREE.Line(geometry, material);

  this.addPoint = function(pos) {
    const stepLength = Math.ceil(length / stepSize) * stepSize * 3;
    if (stepLength >= vertices.length) {
      const oldVertices = vertices;
      vertices = new Float32Array(stepLength);
      for (let i = 0; i < oldVertices.length; i++) {
        vertices[i] = oldVertices[i];
      }
      for (let i = oldVertices.length; i < vertices.length; i++) {
        vertices[i] = Number.NEGATIVE_INFINITY;
      }
    }
    vertices[length * 3 + 0] = pos.x;
    vertices[length * 3 + 1] = pos.y;
    vertices[length * 3 + 2] = pos.z;
    geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere();
    length += 1;
  };

  this.addToScene = function(scene) {
    scene.add(mesh);
  };
};

const RenderTool = function() {

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const screenScene = new THREE.Scene();
  const screenCamera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer();
  const walls = createWalls();
  const lights = createLights();
  const stats = window.planetsState.stats;

  // screenMaterial not const because assignment takes space and has deps
  let screenMaterial;
  let renderCount = 0;
  let oldConfig = $.extend({}, window.planetsConfig);
  let rtBackBuffer1;
  let rtBackBuffer2;
  let rtScreen;
  let particles = new Particles();
  let oldParticles = [];
  let oldTubes = [];

  const setup = function() {
    const gui = new dat.GUI();
    for (let varName in window.planetsConfig) {
      if (window.planetsConfig.hasOwnProperty(varName)) {
        gui.add(window.planetsConfig, varName);
      }
    }

    camera.position.z = window.planetsConfig.scale;
    for (let light of lights) {
      scene.add(light);
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    if (!gpgpuVersion) {
      document.body.appendChild(renderer.domElement);
    }

    const controls = new THREE.OrbitControls(camera, renderer.domElement);

    rtBackBuffer1 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
    rtBackBuffer2 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
    rtScreen = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });

    const plane = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);

    screenMaterial =
      new THREE.ShaderMaterial({
        uniforms: {
          backbuffer: { type: 't', value: rtBackBuffer1 },
          screen: { type: 't', value: rtScreen },
          // planetsTexture: { type: 't', value: null },
          resolution: { type: 'v2', value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader: $('#vertexshader').text(),
        fragmentShader: $('#fragment_shader_screen').text(),
        depthWrite: false,
        transparent: true
      });

    const quad = new THREE.Mesh(plane, screenMaterial);

    quad.position.z = -1;

    screenScene.add(quad);
  };
  setup();

  const mapPositionToScene = function(p, position) {
    let newPos = position;
    if (p.isStar) {
      newPos = {
        x: position.x * window.planetsConfig.starScale + p.parent.position.x,
        y: position.y * window.planetsConfig.starScale + p.parent.position.y,
        z: position.z * window.planetsConfig.starScale + p.parent.position.z
      };
    }
    return {
      x: newPos.x * window.planetsConfig.maxX,
      y: newPos.y * window.planetsConfig.maxY,
      z: window.planetsConfig.useZ ? (newPos.z * window.planetsConfig.maxZ) : 0.0
    };
  };

  const createTube = function(p) {
    const path = [];
    for (let pos of p.positions) {
      const pos2 = mapPositionToScene(p, pos);
      const posVec3 = new THREE.Vector3(pos2.x, pos2.y, pos2.z);
      path.push(posVec3);
    }
    if (path.length === 0) {
      return;
    }
    const spline = new THREE.SplineCurve3(path);
    const geometry = new THREE.TubeGeometry(
        spline,
        window.planetsConfig.tubeSegments,
        0.3,   // radius
        4,     // radiusSegments
        false  // closed
    );
    const tube = new THREE.Mesh(geometry, p.tubeMaterial);
    scene.add(tube);
    oldTubes.push(tube);
  };

  const updateMeshes = function(p, timeVal) {
    const t = p.lastMesh;
    const mesh = p.meshes[t];
    if (mesh === undefined) {
      // TODO: why does this happen?
      return;
    }
    scene.add(mesh);
    const pos = mapPositionToScene(p, p.position);
    mesh.position.set(pos.x, pos.y, pos.z);

    const dir = new THREE.Vector3(
                mesh.position.x + p.velocity.x,
                mesh.position.y + p.velocity.y,
                mesh.position.z + p.velocity.z);
    mesh.lookAt(dir);

    const scale =
      window.planetsConfig.radiusScale *
        (window.planetsConfig.usePlanetRadius ? p.radius : 1.0);
    mesh.scale.x = scale;
    mesh.scale.y = scale;
    mesh.scale.z = scale;

    const color =
      (p.isStar && window.planetsConfig.useParentColor) ?
        p.parent.color : p.color;
    if (mesh.material.uniforms !== undefined &&
        mesh.material.uniforms.time !== undefined) {
      mesh.material.uniforms.time.value = timeVal + p.index * 637;
      mesh.material.uniforms.color.value =
        new THREE.Color(color.r,
                        color.g,
                        color.b);
    }
    if (mesh.material.color !== undefined) {
      mesh.material.color = color;
    }
    p.lastMesh = (p.lastMesh + 1) % p.meshes.length;
  };

  this.render = function() {
    const firstRender = (renderCount === 0);
    renderCount += 1;
    const newTime = (new Date().getTime()) / 1000.0;
    const timeVal = newTime - window.planetsState.startTime;

    if (oldConfig.planetCount !== window.planetsConfig.planetCount ||
        oldConfig.starCount !== window.planetsConfig.starCount) {
      createPlanets();
      createEdges();
    }
    if (firstRender || oldConfig.useBackBuffer !== window.planetsConfig.useBackBuffer) {
      if (window.planetsConfig.useBackBuffer) {
        for (let wall of walls) {
          scene.remove(wall);
        }
      } else {
        for (let wall of walls) {
          scene.add(wall);
        }
      }
    }
    if (window.planetsConfig.useTubes) {
      for (let tube of oldTubes) {
        scene.remove(tube);
        tube.geometry.dispose();
      }
      oldTubes = [];
    }
    
    if ((!window.planetsConfig.useParticles && oldConfig.useParticles) || 
        (!window.planetsConfig.useParticleTrail && oldConfig.useParticleTrail)) {
      if (!window.planetsConfig.useParticles) {
        particles.removeFromScene(scene);
      }
      for (let pt of oldParticles) {
        pt.removeFromScene(scene);
      }
      oldParticles = [];
    }
    if (window.planetsConfig.useParticles) {
      if (window.planetsConfig.useParticleTrail) {
        oldParticles.push(particles);
        let ptIndex = 0;
        for (let pt of oldParticles) {
          if (window.planetsConfig.usePTrailOpacity) {
            pt.setOpacity(ptIndex / oldParticles.length);
          } else {
            pt.setOpacity(1.0);
          }
          ptIndex++;
        }
        particles = new Particles();
        particles.addToScene(scene);
      } else {
        particles.removeFromScene(scene);
        particles = new Particles();
        particles.addToScene(scene);
      }
    }

    for (let planet of window.planetsState.planets) {
      const pos = mapPositionToScene(planet, planet.position);
      if (window.planetsConfig.useTubes) {
        createTube(planet);
      }
      if (window.planetsConfig.useParticles) {
        particles.addPlanet(planet, pos);
      }
      if (window.planetsConfig.useMeshes) {
        updateMeshes(planet, timeVal);
      }
      if (window.planetsConfig.useBufferGeometry) {
        if (planet.bufferGeometry === undefined) {
          planet.bufferGeometry = new BufferGeometry();
          planet.bufferGeometry.addToScene(scene);
        }
        planet.bufferGeometry.addPoint(pos);
      }
    }

    // remove meshes when config says so
    if (!window.planetsConfig.useMeshes) {
      if (oldConfig.useMeshes) {
        for (let planet of window.planetsState.planets) {
          for (let mesh of planet.meshes) {
            scene.remove(mesh);
          }
        }
      }
    }

    if (!window.planetsConfig.useBackBuffer) {
      renderer.render(scene, camera);
    } else {
      renderer.render(scene, camera, rtScreen, true);
      renderer.render(screenScene, screenCamera, null, false);
      renderer.render(screenScene, screenCamera, rtBackBuffer1, false);
    }

    // swap buffers
    [rtBackBuffer1, rtBackBuffer2] = [rtBackBuffer2, rtBackBuffer1];
    screenMaterial.uniforms.backbuffer.value = rtBackBuffer2;

    stats.update();
    oldConfig = $.extend({}, window.planetsConfig);
    requestAnimationFrame(() => this.render());
  };
};

const main = function() {
  window.planetsState = {
    planets: [],
    edges: [],
    meshMakers: [
      // MeshMaker.createMeshMaker('#fragmentshader1'),
      MeshMaker.createMeshMaker('#fragmentshader2')
      // MeshMaker.createMeshMaker('#fragmentshader3'),
      // MeshMaker.createMeshMaker('#fragmentshader4'),
      // MeshMaker.createMeshMaker('#fragmentshader5'),
      // MeshMaker.createMeshMaker('#fragmentshader6'),
    ],
    startTime: (new Date().getTime()) / 1000.0 - 500.0
  };

  const stats = new Stats();
  window.planetsState.stats = stats;
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '0px';
  const container = document.getElementById('statsContainer');
  container.appendChild(stats.domElement);

  if (gpgpuVersion) {
    window.planetsConfig.planetCount = 100 * 100;
    window.planetsConfig.starCount = 0;
    window.planetsConfig.trailLength = 0;
    window.planetsConfig.starTrailLength = 0;
    window.planetsConfig.useParticles = true;
    window.planetsConfig.useMeshes = false;
    createPlanets();
    const computeShader = new ComputeShader(window.planetsState.planets);
    computeShader.compute();
  } else {
    createPlanets();
    createEdges();
    updatePlanets();
    setInterval(updatePlanets, 10);
    const rt = new RenderTool();
    rt.render();
  }
};

$(main);
