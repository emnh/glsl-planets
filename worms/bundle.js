(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*jslint browser: true, es6: true */

/*global
  $, THREE, Stats, dat, sweetAlert
*/

// noprotect

// babel will add it for us
// 'use strict';

'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var Config = function Config() {
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

var gpgpuVersion = false;

var ComputeShader = function ComputeShader() {
  var sq = Math.ceil(Math.sqrt(window.planetsState.planets.length));
  var th = sq;
  var floatsPerPlanet = 4.0;
  var tw = sq;
  var outHeight = sq;
  var outWidth = sq;

  this.renderer = new THREE.WebGLRenderer();
  this.renderer.setSize(outWidth, outHeight);
  // XXX: for debug only
  document.body.appendChild(this.renderer.domElement);

  this.camera = new THREE.Camera();
  this.camera.position.z = 1;

  // Init RTT stuff
  var gl = this.renderer.getContext();

  if (!gl.getExtension('OES_texture_float')) {
    sweetAlert('No OES_texture_float support for float textures!', 'error');
    return;
  }

  if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) === 0) {
    sweetAlert('No support for vertex shader textures!', 'error');
    return;
  }

  this.scene = new THREE.Scene();

  var defines = {
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

  this.passThroughMaterial = new THREE.ShaderMaterial({
    defines: defines,
    uniforms: this.uniformsPassThrough,
    vertexShader: $('#vertexShaderPassThrough').text(),
    fragmentShader: $('#fragmentShaderPassThrough').text(),
    depthWrite: false
  });

  this.velocityMaterial = new THREE.ShaderMaterial({
    defines: defines,
    uniforms: this.uniforms,
    vertexShader: $('#vertexShaderPassThrough').text(),
    fragmentShader: $('#fragmentShaderVelocity').text(),
    depthWrite: false
  });

  this.positionMaterial = new THREE.ShaderMaterial({
    defines: defines,
    uniforms: this.uniforms,
    vertexShader: $('#vertexShaderPassThrough').text(),
    fragmentShader: $('#fragmentShaderPosition').text(),
    depthWrite: false
  });

  var plane = new THREE.PlaneBufferGeometry(2, 2);
  this.mesh = new THREE.Mesh(plane, this.passThroughMaterial);
  // this.mesh.position.z = -1;
  this.scene.add(this.mesh);

  var compute = this;

  this.screen = new function () {
    this.screenScene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 1;

    var controls = new THREE.OrbitControls(this.camera, compute.renderer.domElement);

    this.geometry = new THREE.Geometry();

    var sphere = new THREE.SphereGeometry(0.01, 50, 50);

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
      attributes: {},
      vertexShader: $('#vertexShaderFromPositionsGeo').text(),
      fragmentShader: $('#fragmentshader2').text(),
      transparent: false
    });

    var smat = new THREE.MeshPhongMaterial({
      color: 0x2194ce,
      bumpScale: 1,
      specular: 0x111111,
      shininess: 50,
      shading: THREE.SmoothShading
    });

    var vertices = this.geometry.vertices;
    var pColor = this.material.attributes.pcolor.value;
    var displacementIndex = this.material.attributes.displacementIndex.value;

    var materials = [];
    this.materials = materials;
    var meshes = [];

    for (var x = 0; x < tw; x++) {
      for (var y = 0; y < th; y++) {
        var xf = x / tw;
        var yf = y / th;
        var pt = new THREE.Vector2(xf, yf);
        var r = Math.random();
        var g = Math.random();
        var b = Math.random();
        var color = new THREE.Color(r, g, b);

        if (window.planetsConfig.useMeshes) {
          var material = this.geoMaterial.clone();
          material.uniforms.udisplacementIndex.value = pt;
          material.uniforms.color.value = color;
          materials.push(material);
          var mesh = new THREE.Mesh(sphere, material);
          var scale = 1.0;
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

  var rt = new THREE.WebGLRenderTarget(tw, tw, {
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

  this.genTexture = function () {
    var rgbaSize = 4;
    var rawPositions = new Float32Array(tw * th * rgbaSize);
    var rawVelocities = new Float32Array(tw * th * rgbaSize);
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = window.planetsState.planets[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var planet = _step.value;

        var i = planet.index * floatsPerPlanet;
        var position = planet.position;
        var p = {
          x: (position.x + 1.0) / 2.0,
          y: (position.y + 1.0) / 2.0,
          z: (position.z + 1.0) / 2.0
        };
        var v = {
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
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator['return']) {
          _iterator['return']();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    var tPositions = new THREE.DataTexture(rawPositions, tw, th, THREE.RGBAFormat, THREE.FloatType);
    tPositions.minFilter = THREE.NearestFilter;
    tPositions.wrapS = THREE.ClampToEdgeWrapping;
    tPositions.wrapT = THREE.ClampToEdgeWrapping;
    tPositions.needsUpdate = true;

    var tVelocities = new THREE.DataTexture(rawVelocities, tw, th, THREE.RGBAFormat, THREE.FloatType);
    tVelocities.minFilter = THREE.NearestFilter;
    tVelocities.wrapS = THREE.ClampToEdgeWrapping;
    tVelocities.wrapT = THREE.ClampToEdgeWrapping;
    tVelocities.needsUpdate = true;

    return [tPositions, tVelocities];
  };

  this.getImageData = function (image) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    return context.getImageData(0, 0, image.width, image.height);
  };

  this.render = function () {
    var _this = this;

    // set input textures from last round
    this.uniforms.texturePositions.value = this.rtPositions2;
    this.uniforms.textureVelocities.value = this.rtVelocities2;
    if (window.planetsConfig.useMeshes) {
      var newTime = new Date().getTime() / 1000.0;
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = this.screen.materials[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var material = _step2.value;

          material.uniforms.texturePositions.value = this.rtPositions2;
          material.uniforms.time.value = newTime - window.planetsState.startTime;
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2['return']) {
            _iterator2['return']();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
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
    var _ref = [this.rtVelocities2, this.rtVelocities1];
    this.rtVelocities1 = _ref[0];
    this.rtVelocities2 = _ref[1];
    var _ref2 = [this.rtPositions2, this.rtPositions1];
    this.rtPositions1 = _ref2[0];
    this.rtPositions2 = _ref2[1];

    window.planetsState.stats.update();
    requestAnimationFrame(function () {
      return _this.render();
    });
  };

  this.compute = function () {
    var _genTexture = this.genTexture();

    var _genTexture2 = _slicedToArray(_genTexture, 2);

    var tPositions = _genTexture2[0];
    var tVelocities = _genTexture2[1];

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

var MeshMaker = function MeshMaker(shader) {
  var scale = 1.0;
  var length = 1.0;
  // this.geometry = new THREE.BoxGeometry( 1/scale, 1/scale, 1/scale );
  // this.geometry = new THREE.TorusGeometry(0.5/scale, 0.25/scale, 16, 100);
  // this.geometry = new THREE.SphereGeometry( 0.03, 50, 50);
  this.geometry = new THREE.SphereGeometry(0.3 / scale, 50, 50);

  // this.geometry = new THREE.CylinderGeometry( 0.3, 0.3, length, 50);
  // rotates the cylinder to initial position so it will rotate correctly with velocity
  // this.geometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, length / 2, 0 ) );
  // this.geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / 2 ) );

  // this.geometry = new THREE.IcosahedronGeometry(0.1);

  this.initMaterial = function () {
    var imgTexture = THREE.ImageUtils.loadTexture('textures/sprite.png');
    // imgTexture.repeat.set( 1, 1 );
    // imgTexture.wrapS = imgTexture.wrapT = THREE.RepeatWrapping;
    // imgTexture.anisotropy = 16;
    this.imgTexture = imgTexture;

    var shininess = 50;
    var specular = 0x111111;
    var bumpScale = 1;
    var shading = THREE.SmoothShading;

    var imgTexture2 = THREE.ImageUtils.loadTexture('textures/moon_1024.jpg');
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

  this.initShader = function () {
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

  this.createMesh = function () {
    var mesh = window.planetsConfig.useShader ? new THREE.Mesh(this.geometry, this.shaderMaterial.clone()) : new THREE.Mesh(this.geometry, this.material.clone());
    return mesh;
  };
};

MeshMaker.createMeshMaker = function (fragmentId) {
  var shader = $(fragmentId).text();
  var meshMaker = new MeshMaker(shader);
  meshMaker.initShader();
  return meshMaker;
};

var randInit = function randInit() {
  return Math.random() * 2.0 - 1.0;
};

var createPlanet = function createPlanet(index) {
  var planet = {
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

var createStars = function createStars() {
  var starPlanets = [];
  var index = window.planetsState.planets.length;
  var _iteratorNormalCompletion3 = true;
  var _didIteratorError3 = false;
  var _iteratorError3 = undefined;

  try {
    for (var _iterator3 = window.planetsState.planets[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      var planet = _step3.value;

      if (planet.isStar) {
        continue;
      }
      if (planet.stars === undefined) {
        planet.stars = [];
      }
      for (var s = planet.stars.length; s < window.planetsConfig.starCount; s++) {
        var star = createPlanet(index);
        starPlanets.push(star);
        star.parent = planet;
        star.radius = planet.radius * 0.5;
        star.mass = 1.0;
        star.isStar = true;
        star.maxPositions = window.planetsConfig.starTrailLength;
        planet.stars.push(star);
        for (var t = 0; t < window.planetsConfig.starTrailLength; t++) {
          var mesh = window.planetsState.meshMakers[star.index % window.planetsState.meshMakers.length].createMesh();
          star.meshes.push(mesh);
        }
        index += 1;
      }
    }
  } catch (err) {
    _didIteratorError3 = true;
    _iteratorError3 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion3 && _iterator3['return']) {
        _iterator3['return']();
      }
    } finally {
      if (_didIteratorError3) {
        throw _iteratorError3;
      }
    }
  }

  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = starPlanets[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var star = _step4.value;

      window.planetsState.planets.push(star);
    }
  } catch (err) {
    _didIteratorError4 = true;
    _iteratorError4 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion4 && _iterator4['return']) {
        _iterator4['return']();
      }
    } finally {
      if (_didIteratorError4) {
        throw _iteratorError4;
      }
    }
  }
};

var createPlanets = function createPlanets() {
  var planetCount = window.planetsState.planets.filter(function (p) {
    return !p.isStar;
  }).length;

  for (var i = planetCount; i < window.planetsConfig.planetCount; i++) {
    var planet = createPlanet(window.planetsState.planets.length);
    window.planetsState.planets.push(planet);
    if (window.planetsConfig.useTubes) {
      planet.tubeMaterial = window.planetsState.meshMakers[planet.index % window.planetsState.meshMakers.length].shaderMaterial.clone();
      //planet.tubeMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    }
    for (var t = 0; t < window.planetsConfig.trailLength; t++) {
      var mesh = window.planetsState.meshMakers[planet.index % window.planetsState.meshMakers.length].createMesh();
      planet.meshes.push(mesh);
    }
  }

  createStars();
};

var createEdges = function createEdges() {
  window.planetsState.edges = [];
  var planetsNoStars = window.planetsState.planets.filter(function (p) {
    return !p.isStar;
  });
  var _iteratorNormalCompletion5 = true;
  var _didIteratorError5 = false;
  var _iteratorError5 = undefined;

  try {
    for (var _iterator5 = planetsNoStars[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
      var p1 = _step5.value;

      // add planet edges
      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = planetsNoStars[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var p2 = _step6.value;

          if (p1 === p2) {
            continue;
          }
          var w = 1.0;
          var edge = [p1, p2, w];
          window.planetsState.edges.push(edge);
        }

        // add star edges
      } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion6 && _iterator6['return']) {
            _iterator6['return']();
          }
        } finally {
          if (_didIteratorError6) {
            throw _iteratorError6;
          }
        }
      }

      var _iteratorNormalCompletion7 = true;
      var _didIteratorError7 = false;
      var _iteratorError7 = undefined;

      try {
        for (var _iterator7 = p1.stars[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
          var p3 = _step7.value;
          var _iteratorNormalCompletion8 = true;
          var _didIteratorError8 = false;
          var _iteratorError8 = undefined;

          try {
            for (var _iterator8 = p1.stars[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
              var p4 = _step8.value;

              if (p3 === p4) {
                continue;
              }
              var w = 1.0;
              var edge = [p3, p4, w];
              window.planetsState.edges.push(edge);
            }
          } catch (err) {
            _didIteratorError8 = true;
            _iteratorError8 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion8 && _iterator8['return']) {
                _iterator8['return']();
              }
            } finally {
              if (_didIteratorError8) {
                throw _iteratorError8;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError7 = true;
        _iteratorError7 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion7 && _iterator7['return']) {
            _iterator7['return']();
          }
        } finally {
          if (_didIteratorError7) {
            throw _iteratorError7;
          }
        }
      }
    }
  } catch (err) {
    _didIteratorError5 = true;
    _iteratorError5 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion5 && _iterator5['return']) {
        _iterator5['return']();
      }
    } finally {
      if (_didIteratorError5) {
        throw _iteratorError5;
      }
    }
  }
};

var createWalls = function createWalls() {
  var planeGeo = new THREE.PlaneGeometry(window.planetsConfig.scale * 2.0 + 0.1, window.planetsConfig.scale * 2.0 + 0.1);

  // const wallColor = 0x111111;
  var wallColor = 0xffffff;

  var walls = [];

  var planeTop = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeTop.position.y = window.planetsConfig.maxY;
  planeTop.rotateX(Math.PI / 2);
  walls.push(planeTop);

  var planeBottom = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeBottom.position.y = -window.planetsConfig.maxY;
  planeBottom.rotateX(-Math.PI / 2);
  walls.push(planeBottom);

  var planeBack = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeBack.position.z = -window.planetsConfig.maxZ;
  planeBack.position.y = 0.0;
  walls.push(planeBack);

  var planeFront = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeFront.position.z = window.planetsConfig.maxZ;
  planeFront.position.y = 0.0;
  planeFront.rotateY(Math.PI);
  walls.push(planeFront);

  var planeRight = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeRight.position.x = window.planetsConfig.maxX;
  planeRight.position.y = 0.0;
  planeRight.rotateY(-Math.PI / 2);
  walls.push(planeRight);

  var planeLeft = new THREE.Mesh(planeGeo, new THREE.MeshPhongMaterial({ color: wallColor }));
  planeLeft.position.x = -window.planetsConfig.maxX;
  planeLeft.position.y = 0.0;
  planeLeft.rotateY(Math.PI / 2);
  walls.push(planeLeft);

  return walls;
};

var createLights = function createLights() {
  var lights = [];
  var mainLight = new THREE.PointLight(0xffffff, 1.5, 250);
  mainLight.position.set(0.0, 0.0, window.planetsConfig.maxZ);
  lights.push(mainLight);
  return lights;
};

var clamp = function clamp(num, min, max) {
  var maxed = num > max ? max : num;
  return num < min ? min : maxed;
};

var reflect = function reflect(reduction, position, speed) {
  var sr = speed / reduction;
  var retVal = undefined;
  if (position + sr <= -1.0 || position + sr >= 1.0) {
    if (position - sr <= -1.0 || position - sr >= 1.0) {
      retVal = [position, 0.0];
    } else {
      retVal = [position - sr, -speed];
    }
  } else {
    retVal = [position + sr, speed];
  }
  return retVal;
};

var max = function max(a, b) {
  return a > b ? a : b;
};

var min = function min(a, b) {
  return a < b ? a : b;
};

var euclid = function euclid(p1, p2) {
  var x = p2.x - p1.x;
  var y = p2.y - p1.y;
  var z = p2.z - p1.z;
  var distSquare = x * x + y * y + z * z;
  var ret = {
    distSquare: distSquare,
    x: x,
    y: y,
    z: z,
    dist: Math.sqrt(distSquare)
  };
  return ret;
};

var updatePlanets = function updatePlanets() {
  var vs = [];
  var _iteratorNormalCompletion9 = true;
  var _didIteratorError9 = false;
  var _iteratorError9 = undefined;

  try {
    for (var _iterator9 = window.planetsState.planets[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
      var p = _step9.value;

      var ve = {
        x: 0.0,
        y: 0.0,
        z: 0.0
      };
      vs[p.index] = ve;
    }

    // compute new velocities
  } catch (err) {
    _didIteratorError9 = true;
    _iteratorError9 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion9 && _iterator9['return']) {
        _iterator9['return']();
      }
    } finally {
      if (_didIteratorError9) {
        throw _iteratorError9;
      }
    }
  }

  var _iteratorNormalCompletion10 = true;
  var _didIteratorError10 = false;
  var _iteratorError10 = undefined;

  try {
    for (var _iterator10 = window.planetsState.edges[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
      var edge = _step10.value;

      var _edge = _slicedToArray(edge, 3);

      var p1 = _edge[0];
      var p2 = _edge[1];
      var w = _edge[2];

      var diff = euclid(p1.position, p2.position);
      var dist = diff.distSquare;
      var F = p1.mass * p2.mass * w;
      if (p1.isStar || p2.isStar) {
        F = 1.0 / (window.planetsConfig.minDist + dist) / window.planetsConfig.starDistReduction / window.planetsConfig.starCount;
      } else {
        F = 1.0 / (window.planetsConfig.minDist + dist) / window.planetsConfig.distReduction / window.planetsConfig.planetCount;
      }
      vs[p1.index].x += diff.x * F;
      vs[p1.index].y += diff.y * F;
      vs[p1.index].z += diff.z * F;
    }

    // adjust velocities
  } catch (err) {
    _didIteratorError10 = true;
    _iteratorError10 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion10 && _iterator10['return']) {
        _iterator10['return']();
      }
    } finally {
      if (_didIteratorError10) {
        throw _iteratorError10;
      }
    }
  }

  var _iteratorNormalCompletion11 = true;
  var _didIteratorError11 = false;
  var _iteratorError11 = undefined;

  try {
    for (var _iterator11 = window.planetsState.planets[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
      var planet = _step11.value;

      var v = vs[planet.index];

      // add random walk
      if (window.planetsConfig.randomWalk && !planet.isStar) {
        var rf = window.planetsConfig.randomWalkScale;
        v.x += randInit() / rf;
        v.y += randInit() / rf;
        v.z += randInit() / rf;
      }

      planet.velocity.x += v.x;
      planet.velocity.y += v.y;
      planet.velocity.z += v.z;

      // limit speed
      var speed = Math.sqrt(planet.velocity.x * planet.velocity.x + planet.velocity.y * planet.velocity.y + planet.velocity.z * planet.velocity.z);
      planet.speed = speed;
      if (speed > window.planetsConfig.maxSpeed) {
        planet.velocity.x *= window.planetsConfig.maxSpeed / speed;
        planet.velocity.y *= window.planetsConfig.maxSpeed / speed;
        planet.velocity.z *= window.planetsConfig.maxSpeed / speed;
        planet.speed = window.planetsConfig.maxSpeed;
      } else if (speed < window.planetsConfig.minSpeed) {
        planet.velocity.x *= window.planetsConfig.minSpeed / speed;
        planet.velocity.y *= window.planetsConfig.minSpeed / speed;
        planet.velocity.z *= window.planetsConfig.minSpeed / speed;
        planet.speed = window.planetsConfig.minSpeed;
      }
    }

    // update positions
  } catch (err) {
    _didIteratorError11 = true;
    _iteratorError11 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion11 && _iterator11['return']) {
        _iterator11['return']();
      }
    } finally {
      if (_didIteratorError11) {
        throw _iteratorError11;
      }
    }
  }

  var _iteratorNormalCompletion12 = true;
  var _didIteratorError12 = false;
  var _iteratorError12 = undefined;

  try {
    for (var _iterator12 = window.planetsState.planets[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
      var planet = _step12.value;

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
      var reduction = planet.isStar ? window.planetsConfig.starSpeedReduction : window.planetsConfig.speedReduction;

      var _reflect = reflect(reduction, planet.position.x, planet.velocity.x);

      var _reflect2 = _slicedToArray(_reflect, 2);

      planet.position.x = _reflect2[0];
      planet.velocity.x = _reflect2[1];

      var _reflect3 = reflect(reduction, planet.position.y, planet.velocity.y);

      var _reflect32 = _slicedToArray(_reflect3, 2);

      planet.position.y = _reflect32[0];
      planet.velocity.y = _reflect32[1];

      var _reflect4 = reflect(reduction, planet.position.z, planet.velocity.z);

      var _reflect42 = _slicedToArray(_reflect4, 2);

      planet.position.z = _reflect42[0];
      planet.velocity.z = _reflect42[1];
    }
  } catch (err) {
    _didIteratorError12 = true;
    _iteratorError12 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion12 && _iterator12['return']) {
        _iterator12['return']();
      }
    } finally {
      if (_didIteratorError12) {
        throw _iteratorError12;
      }
    }
  }
};

var Particles = function Particles() {
  var geometry = new THREE.Geometry();

  var material = new THREE.ShaderMaterial({
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
  var particleCloud = new THREE.PointCloud(geometry, material);

  this.setOpacity = function (o) {
    material.uniforms.opacity.value = o;
  };

  this.add = function (pt, size, color, color2) {
    var vertices = geometry.vertices;
    var idx = vertices.length;
    vertices.push(pt);
    var vsize = material.attributes.psize.value;
    var vcolor = material.attributes.pcolor.value;
    var vcolor2 = material.attributes.pcolor2.value;
    vsize[idx] = size;
    vcolor[idx] = color;
    vcolor2[idx] = color2;
  };

  this.addPlanet = function (planet, pos) {
    var size = window.planetsConfig.radiusScale * 20.0 * (window.planetsConfig.usePlanetRadius ? planet.radius : 1.0);
    var color = planet.isStar && window.planetsConfig.useParentColor ? planet.parent.color : planet.color;
    if (planet.oldParticlePos !== undefined && window.planetsConfig.particleInterpolation > 0.0) {
      var p1 = planet.oldParticlePos;
      var p2 = pos;
      var diff = euclid(p1, p2);
      var dist = diff.dist;
      var maxI = window.planetsConfig.particleInterpolation * dist;
      for (var i = 1; i <= maxI; i++) {
        var scale = i / maxI;
        var p3 = {
          x: p1.x + diff.x * scale,
          y: p1.y + diff.y * scale,
          z: p1.z + diff.z * scale
        };
        var v3 = new THREE.Vector3(p3.x, p3.y, p3.z);
        this.add(v3, size, color, planet.color2);
      }
    }
    this.add(new THREE.Vector3(pos.x, pos.y, pos.z), size, color, planet.color2);
    planet.oldParticlePos = pos;
  };

  this.addToScene = function (scene) {
    scene.add(particleCloud);
  };

  this.removeFromScene = function (scene) {
    scene.remove(particleCloud);
    geometry.dispose();
    material.dispose();
  };
};

var BufferGeometry = function BufferGeometry() {
  var geometry = new THREE.BufferGeometry();

  var length = 0;
  var stepSize = 1000;

  var vertices = new Float32Array(0);
  var material = new THREE.LineBasicMaterial({
    vertexColors: THREE.VertexColors,
    linewidth: 1.0
  });
  var mesh = new THREE.Line(geometry, material);

  this.addPoint = function (pos) {
    var stepLength = Math.ceil(length / stepSize) * stepSize * 3;
    if (stepLength >= vertices.length) {
      var oldVertices = vertices;
      vertices = new Float32Array(stepLength);
      for (var i = 0; i < oldVertices.length; i++) {
        vertices[i] = oldVertices[i];
      }
      for (var i = oldVertices.length; i < vertices.length; i++) {
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

  this.addToScene = function (scene) {
    scene.add(mesh);
  };
};

var RenderTool = function RenderTool() {

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  var screenScene = new THREE.Scene();
  var screenCamera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 1000);
  var renderer = new THREE.WebGLRenderer();
  var walls = createWalls();
  var lights = createLights();
  var stats = window.planetsState.stats;

  // screenMaterial not const because assignment takes space and has deps
  var screenMaterial = undefined;
  var renderCount = 0;
  var oldConfig = $.extend({}, window.planetsConfig);
  var rtBackBuffer1 = undefined;
  var rtBackBuffer2 = undefined;
  var rtScreen = undefined;
  var particles = new Particles();
  var oldParticles = [];
  var oldTubes = [];

  var setup = function setup() {
    var gui = new dat.GUI();
    for (var varName in window.planetsConfig) {
      if (window.planetsConfig.hasOwnProperty(varName)) {
        gui.add(window.planetsConfig, varName);
      }
    }

    camera.position.z = window.planetsConfig.scale;
    var _iteratorNormalCompletion13 = true;
    var _didIteratorError13 = false;
    var _iteratorError13 = undefined;

    try {
      for (var _iterator13 = lights[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
        var light = _step13.value;

        scene.add(light);
      }
    } catch (err) {
      _didIteratorError13 = true;
      _iteratorError13 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion13 && _iterator13['return']) {
          _iterator13['return']();
        }
      } finally {
        if (_didIteratorError13) {
          throw _iteratorError13;
        }
      }
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    if (!gpgpuVersion) {
      document.body.appendChild(renderer.domElement);
    }

    var controls = new THREE.OrbitControls(camera, renderer.domElement);

    rtBackBuffer1 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
    rtBackBuffer2 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
    rtScreen = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });

    var plane = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);

    screenMaterial = new THREE.ShaderMaterial({
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

    var quad = new THREE.Mesh(plane, screenMaterial);

    quad.position.z = -1;

    screenScene.add(quad);
  };
  setup();

  var mapPositionToScene = function mapPositionToScene(p, position) {
    var newPos = position;
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
      z: window.planetsConfig.useZ ? newPos.z * window.planetsConfig.maxZ : 0.0
    };
  };

  var createTube = function createTube(p) {
    var path = [];
    var _iteratorNormalCompletion14 = true;
    var _didIteratorError14 = false;
    var _iteratorError14 = undefined;

    try {
      for (var _iterator14 = p.positions[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
        var pos = _step14.value;

        var pos2 = mapPositionToScene(p, pos);
        var posVec3 = new THREE.Vector3(pos2.x, pos2.y, pos2.z);
        path.push(posVec3);
      }
    } catch (err) {
      _didIteratorError14 = true;
      _iteratorError14 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion14 && _iterator14['return']) {
          _iterator14['return']();
        }
      } finally {
        if (_didIteratorError14) {
          throw _iteratorError14;
        }
      }
    }

    if (path.length === 0) {
      return;
    }
    var spline = new THREE.SplineCurve3(path);
    var geometry = new THREE.TubeGeometry(spline, window.planetsConfig.tubeSegments, 0.3, // radius
    4, // radiusSegments
    false // closed
    );
    var tube = new THREE.Mesh(geometry, p.tubeMaterial);
    scene.add(tube);
    oldTubes.push(tube);
  };

  var updateMeshes = function updateMeshes(p, timeVal) {
    var t = p.lastMesh;
    var mesh = p.meshes[t];
    if (mesh === undefined) {
      // TODO: why does this happen?
      return;
    }
    scene.add(mesh);
    var pos = mapPositionToScene(p, p.position);
    mesh.position.set(pos.x, pos.y, pos.z);

    var dir = new THREE.Vector3(mesh.position.x + p.velocity.x, mesh.position.y + p.velocity.y, mesh.position.z + p.velocity.z);
    mesh.lookAt(dir);

    var scale = window.planetsConfig.radiusScale * (window.planetsConfig.usePlanetRadius ? p.radius : 1.0);
    mesh.scale.x = scale;
    mesh.scale.y = scale;
    mesh.scale.z = scale;

    var color = p.isStar && window.planetsConfig.useParentColor ? p.parent.color : p.color;
    if (mesh.material.uniforms !== undefined && mesh.material.uniforms.time !== undefined) {
      mesh.material.uniforms.time.value = timeVal + p.index * 637;
      mesh.material.uniforms.color.value = new THREE.Color(color.r, color.g, color.b);
    }
    if (mesh.material.color !== undefined) {
      mesh.material.color = color;
    }
    p.lastMesh = (p.lastMesh + 1) % p.meshes.length;
  };

  this.render = function () {
    var _this2 = this;

    var firstRender = renderCount === 0;
    renderCount += 1;
    var newTime = new Date().getTime() / 1000.0;
    var timeVal = newTime - window.planetsState.startTime;

    if (oldConfig.planetCount !== window.planetsConfig.planetCount || oldConfig.starCount !== window.planetsConfig.starCount) {
      createPlanets();
      createEdges();
    }
    if (firstRender || oldConfig.useBackBuffer !== window.planetsConfig.useBackBuffer) {
      if (window.planetsConfig.useBackBuffer) {
        var _iteratorNormalCompletion15 = true;
        var _didIteratorError15 = false;
        var _iteratorError15 = undefined;

        try {
          for (var _iterator15 = walls[Symbol.iterator](), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
            var wall = _step15.value;

            scene.remove(wall);
          }
        } catch (err) {
          _didIteratorError15 = true;
          _iteratorError15 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion15 && _iterator15['return']) {
              _iterator15['return']();
            }
          } finally {
            if (_didIteratorError15) {
              throw _iteratorError15;
            }
          }
        }
      } else {
        var _iteratorNormalCompletion16 = true;
        var _didIteratorError16 = false;
        var _iteratorError16 = undefined;

        try {
          for (var _iterator16 = walls[Symbol.iterator](), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
            var wall = _step16.value;

            scene.add(wall);
          }
        } catch (err) {
          _didIteratorError16 = true;
          _iteratorError16 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion16 && _iterator16['return']) {
              _iterator16['return']();
            }
          } finally {
            if (_didIteratorError16) {
              throw _iteratorError16;
            }
          }
        }
      }
    }
    if (window.planetsConfig.useTubes) {
      var _iteratorNormalCompletion17 = true;
      var _didIteratorError17 = false;
      var _iteratorError17 = undefined;

      try {
        for (var _iterator17 = oldTubes[Symbol.iterator](), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
          var tube = _step17.value;

          scene.remove(tube);
          tube.geometry.dispose();
        }
      } catch (err) {
        _didIteratorError17 = true;
        _iteratorError17 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion17 && _iterator17['return']) {
            _iterator17['return']();
          }
        } finally {
          if (_didIteratorError17) {
            throw _iteratorError17;
          }
        }
      }

      oldTubes = [];
    }

    if (!window.planetsConfig.useParticles && oldConfig.useParticles || !window.planetsConfig.useParticleTrail && oldConfig.useParticleTrail) {
      if (!window.planetsConfig.useParticles) {
        particles.removeFromScene(scene);
      }
      var _iteratorNormalCompletion18 = true;
      var _didIteratorError18 = false;
      var _iteratorError18 = undefined;

      try {
        for (var _iterator18 = oldParticles[Symbol.iterator](), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
          var pt = _step18.value;

          pt.removeFromScene(scene);
        }
      } catch (err) {
        _didIteratorError18 = true;
        _iteratorError18 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion18 && _iterator18['return']) {
            _iterator18['return']();
          }
        } finally {
          if (_didIteratorError18) {
            throw _iteratorError18;
          }
        }
      }

      oldParticles = [];
    }
    if (window.planetsConfig.useParticles) {
      if (window.planetsConfig.useParticleTrail) {
        oldParticles.push(particles);
        var ptIndex = 0;
        var _iteratorNormalCompletion19 = true;
        var _didIteratorError19 = false;
        var _iteratorError19 = undefined;

        try {
          for (var _iterator19 = oldParticles[Symbol.iterator](), _step19; !(_iteratorNormalCompletion19 = (_step19 = _iterator19.next()).done); _iteratorNormalCompletion19 = true) {
            var pt = _step19.value;

            if (window.planetsConfig.usePTrailOpacity) {
              pt.setOpacity(ptIndex / oldParticles.length);
            } else {
              pt.setOpacity(1.0);
            }
            ptIndex++;
          }
        } catch (err) {
          _didIteratorError19 = true;
          _iteratorError19 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion19 && _iterator19['return']) {
              _iterator19['return']();
            }
          } finally {
            if (_didIteratorError19) {
              throw _iteratorError19;
            }
          }
        }

        particles = new Particles();
        particles.addToScene(scene);
      } else {
        particles.removeFromScene(scene);
        particles = new Particles();
        particles.addToScene(scene);
      }
    }

    var _iteratorNormalCompletion20 = true;
    var _didIteratorError20 = false;
    var _iteratorError20 = undefined;

    try {
      for (var _iterator20 = window.planetsState.planets[Symbol.iterator](), _step20; !(_iteratorNormalCompletion20 = (_step20 = _iterator20.next()).done); _iteratorNormalCompletion20 = true) {
        var planet = _step20.value;

        var pos = mapPositionToScene(planet, planet.position);
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
    } catch (err) {
      _didIteratorError20 = true;
      _iteratorError20 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion20 && _iterator20['return']) {
          _iterator20['return']();
        }
      } finally {
        if (_didIteratorError20) {
          throw _iteratorError20;
        }
      }
    }

    if (!window.planetsConfig.useMeshes) {
      if (oldConfig.useMeshes) {
        var _iteratorNormalCompletion21 = true;
        var _didIteratorError21 = false;
        var _iteratorError21 = undefined;

        try {
          for (var _iterator21 = window.planetsState.planets[Symbol.iterator](), _step21; !(_iteratorNormalCompletion21 = (_step21 = _iterator21.next()).done); _iteratorNormalCompletion21 = true) {
            var planet = _step21.value;
            var _iteratorNormalCompletion22 = true;
            var _didIteratorError22 = false;
            var _iteratorError22 = undefined;

            try {
              for (var _iterator22 = planet.meshes[Symbol.iterator](), _step22; !(_iteratorNormalCompletion22 = (_step22 = _iterator22.next()).done); _iteratorNormalCompletion22 = true) {
                var mesh = _step22.value;

                scene.remove(mesh);
              }
            } catch (err) {
              _didIteratorError22 = true;
              _iteratorError22 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion22 && _iterator22['return']) {
                  _iterator22['return']();
                }
              } finally {
                if (_didIteratorError22) {
                  throw _iteratorError22;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError21 = true;
          _iteratorError21 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion21 && _iterator21['return']) {
              _iterator21['return']();
            }
          } finally {
            if (_didIteratorError21) {
              throw _iteratorError21;
            }
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
    var _ref3 = [rtBackBuffer2, rtBackBuffer1];
    rtBackBuffer1 = _ref3[0];
    rtBackBuffer2 = _ref3[1];

    screenMaterial.uniforms.backbuffer.value = rtBackBuffer2;

    stats.update();
    oldConfig = $.extend({}, window.planetsConfig);
    requestAnimationFrame(function () {
      return _this2.render();
    });
  };
};

var main = function main() {
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
    startTime: new Date().getTime() / 1000.0 - 500.0
  };

  var stats = new Stats();
  window.planetsState.stats = stats;
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '0px';
  var container = document.getElementById('statsContainer');
  container.appendChild(stats.domElement);

  if (gpgpuVersion) {
    window.planetsConfig.planetCount = 100 * 100;
    window.planetsConfig.starCount = 0;
    window.planetsConfig.trailLength = 0;
    window.planetsConfig.starTrailLength = 0;
    window.planetsConfig.useParticles = true;
    window.planetsConfig.useMeshes = false;
    createPlanets();
    var computeShader = new ComputeShader(window.planetsState.planets);
    computeShader.compute();
  } else {
    createPlanets();
    createEdges();
    updatePlanets();
    setInterval(updatePlanets, 10);
    var rt = new RenderTool();
    rt.render();
  }
};

$(main);

},{}]},{},[1]);
