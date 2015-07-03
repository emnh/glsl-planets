/*jslint browser: true, es6: true */

/*global
  $, THREE, Stats, dat
*/

// noprotect

"use strict";

var Config = function () {
  this.planetCount = 5;
  this.starCount = 25;
  this.maxSpeed = 0.01;
  this.minSpeed = 0.001;
  this.distReduction = 1.0e5;
  this.starDistReduction = 1.0e5;
  this.speedReduction = 1.0;
  this.starSpeedReduction = 0.1;
  //this.minDist = 0.001;
  this.trailLength = 0;
  this.starTrailLength = 1;
  this.randomWalk = false;
  this.useParentColor = true;
  this.useBackBuffer = false;
  this.useShader = true;
  this.useTubes = false;
  this.tubeSegments = 20;
  this.useBufferGeometry = true;
  this.useParticles = false;
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

var debugCompute = false;

var ComputeShader = function () {
  var
    sq = Math.ceil(Math.sqrt(window.planetsState.planets.length)),
    th = sq,
    vec4PerPlanet = 6.0,
    tw = sq * vec4PerPlanet,
    outHeight = sq,
    outWidth = sq,
    fShader, plane, quad;

  this.renderer = new THREE.WebGLRenderer();
  this.renderer.setSize(outWidth, outHeight);
  // XXX: for debug only
  document.body.appendChild(this.renderer.domElement);

  this.camera = new THREE.PerspectiveCamera(100, outWidth / outHeight, 0.1, 1000);
  this.camera.position.z = 1;

  this.scene = new THREE.Scene();

  fShader = "#define SQPLANET " + sq + ".0\n";
  fShader += "#define VEC4PERPLANET " + vec4PerPlanet + ".0\n";
  fShader += $("#fragment_shader_compute").text();

  this.material =
    new THREE.ShaderMaterial({
      uniforms: {
        distReduction: { type: "f", value: window.planetsConfig.distReduction },
        planetsTexture: { type: "t", value: null },
        resolution: { type: "v2", value: new THREE.Vector2(tw, th) }
      },
      vertexShader: $("#vertexshader").text(),
      fragmentShader: fShader,
      depthWrite: false
    });

  plane = new THREE.PlaneGeometry(sq, sq);
  quad = new THREE.Mesh(plane, this.material);
  quad.position.z = -1;
  this.scene.add(quad);

  this.rtCompute = new THREE.WebGLRenderTarget(sq, sq, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });

  // http://stackoverflow.com/questions/9882716/packing-float-into-vec4-how-does-this-code-work?rq=1
  // encodes a number between 0 and 1
  this.encodeFloat = function (depth) {
    var
      base = 255.0,
      bitShift = [base * base * base, base * base, base, 1.0],
      bitMask = [0.0, 1.0 / base, 1.0 / base, 1.0 / base],
      res = [
        (depth * bitShift[0]) % 1.0,
        (depth * bitShift[1]) % 1.0,
        (depth * bitShift[2]) % 1.0,
        (depth * bitShift[3]) % 1.0
      ];
    res = [(res[0] - res[0] * bitMask[0]) * base,
           (res[1] - res[0] * bitMask[1]) * base,
           (res[2] - res[1] * bitMask[2]) * base,
           (res[3] - res[2] * bitMask[3]) * base];
    return res;
  };

  this.decodeFloat = function (rgbaDepth) {
    var
      base = 255.0,
      bitShift = [
        1.0 / (base * base * base),
        1.0 / (base * base),
        1.0 / base,
        1.0
      ],
      depth =
      rgbaDepth[0] * bitShift[0] +
      rgbaDepth[1] * bitShift[1] +
      rgbaDepth[2] * bitShift[2] +
      rgbaDepth[3] * bitShift[3];
    return depth;
  };

  this.genTexture = function () {
    var
      rs = 4,
      rOffset = 0,
      gOffset = 1,
      bOffset = 2,
      aOffset = 3,
      b = new Uint8Array(tw * th * rs);
    for (var planet of window.planetsState.planets) {
      var i = planet.index * vec4PerPlanet * rs;
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
      var rgba;
      rgba = this.encodeFloat(p.x);
      b[i++] = rgba[0];
      b[i++] = rgba[1];
      b[i++] = rgba[2];
      b[i++] = rgba[3];
      rgba = this.encodeFloat(p.y);
      b[i++] = rgba[0];
      b[i++] = rgba[1];
      b[i++] = rgba[2];
      b[i++] = rgba[3];
      rgba = this.encodeFloat(p.z);
      b[i++] = rgba[0];
      b[i++] = rgba[1];
      b[i++] = rgba[2];
      b[i++] = rgba[3];
      rgba = this.encodeFloat(v.x);
      b[i++] = rgba[0];
      b[i++] = rgba[1];
      b[i++] = rgba[2];
      b[i++] = rgba[3];
      rgba = this.encodeFloat(v.y);
      b[i++] = rgba[0];
      b[i++] = rgba[1];
      b[i++] = rgba[2];
      b[i++] = rgba[3];
      rgba = this.encodeFloat(v.z);
      b[i++] = rgba[0];
      b[i++] = rgba[1];
      b[i++] = rgba[2];
      b[i++] = rgba[3];
    }
    var dt = new THREE.DataTexture(b, tw, th, THREE.RGBAFormat);
    dt.needsUpdate = true;
    return dt;
    // resources:
    // http://aras-p.info/blog/2009/07/30/encoding-floats-to-rgba-the-final/
    // http://stackoverflow.com/questions/17217936/how-can-i-access-imagedata-from-a-rendertarget
  };

  this.getImageData = function (image) {
    var canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;

    var context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    return context.getImageData(0, 0, image.width, image.height);
  };

  this.compute = function () {
    var texture = this.genTexture();
    this.material.uniforms.planetsTexture.value = texture;
    //this.renderer.render(scene, camera, this.rtCompute, true);
    this.renderer.render(this.scene, this.camera); //, null, true);
    //var img = this.getImageData(this.renderer.domElement);
  };
};


var MeshMaker = function (shader) {

  var
    scale = 1.0,
    length = 1.0;
  //this.geometry = new THREE.BoxGeometry( 1/scale, 1/scale, 1/scale );
  //this.geometry = new THREE.TorusGeometry(0.5/scale, 0.25/scale, 16, 100);
  //this.geometry = new THREE.SphereGeometry( 0.03, 50, 50);
  this.geometry = new THREE.SphereGeometry( 0.3 / scale, 50, 50);

  //this.geometry = new THREE.CylinderGeometry( 0.3, 0.3, length, 50);
  // rotates the cylinder to initial position so it will rotate correctly with velocity
  //this.geometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, length / 2, 0 ) );
  //this.geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / 2 ) );
  //this.geometry = new THREE.IcosahedronGeometry(0.1);

  this.initMaterial = function () {
    var imgTexture = THREE.ImageUtils.loadTexture( "textures/sprite.png");
    //imgTexture.repeat.set( 1, 1 );
    //imgTexture.wrapS = imgTexture.wrapT = THREE.RepeatWrapping;
    //imgTexture.anisotropy = 16;
    this.imgTexture = imgTexture;

    var shininess = 50, specular = 0x111111, bumpScale = 1, shading = THREE.SmoothShading;

    var imgTexture2 = THREE.ImageUtils.loadTexture( "textures/moon_1024.jpg");
    imgTexture2.wrapS = imgTexture2.wrapT = THREE.RepeatWrapping;
    imgTexture2.anisotropy = 16;
    this.imgTexture2 = imgTexture2;

    //this.material = new THREE.MeshPhongMaterial( { map: imgTexture, bumpMap: imgTexture, bumpScale: bumpScale, color: 0xffffff, specular: specular, shininess: shininess, shading: shading } );
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
        time: { type: "f", value: 0.0 },
        resolution: { type: "v2", value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        color: { type: "c", value: new THREE.Color(1.0, 1.0, 1.0) },
        material: { type: "t", value: this.imgTexture }
      },
      vertexShader: $("#vertexshader").text(),
      fragmentShader: shader,
      transparent: true
    });
  };

  this.createMesh = function () {
    var mesh;
    if (window.planetsConfig.useShader) {
      mesh = new THREE.Mesh(this.geometry, this.shaderMaterial.clone());
    } else {
      mesh = new THREE.Mesh(this.geometry, this.material.clone());
    }
    return mesh;
  };

};
MeshMaker.createMeshMaker = function (fragmentId) {
  var shader = $(fragmentId).text();
  var meshMaker = new MeshMaker(shader);
  meshMaker.initShader();
  return meshMaker;
};

var randInit = function () {
  return Math.random() * 2.0 - 1.0;
};

var createPlanet = function (index) {
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

var createStars = function () {
  var starPlanets = [];
  var index = window.planetsState.planets.length; //window.planetsConfig.planetCount;
  for (var planet of window.planetsState.planets) {
    if (planet.isStar) {
      continue;
    }
    if (planet.stars === undefined) {
      planet.stars = [];
    }
    for (var s = planet.stars.length; s < window.planetsConfig.starCount; s++) {
      star = createPlanet(index);
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
    // add star formation window.planetsState.edges
    for (var s2 of planet.stars) {
      for (var s3 of planet.stars) {
        if (s2 === s3) {
          continue;
        }
        var w = 1.0e5;
        var edge = [s2, s3, w];
        window.planetsState.edges.push(edge);
      }
    }
  }
  for (var star of starPlanets) {
    window.planetsState.planets.push(star);
  }
};

var createPlanets = function () {
  var planetCount = window.planetsState.planets.filter((p) => !p.isStar).length;

  for (var i = planetCount; i < window.planetsConfig.planetCount; i++) {
    var planet = createPlanet(window.planetsState.planets.length);
    window.planetsState.planets.push(planet);
    if (window.planetsConfig.useTubes) {
      planet.tubeMaterial = window.planetsState.meshMakers[planet.index % window.planetsState.meshMakers.length].shaderMaterial.clone();
    }
    for (var t = 0; t < window.planetsConfig.trailLength; t++) {
      var mesh = window.planetsState.meshMakers[planet.index % window.planetsState.meshMakers.length].createMesh();
      planet.meshes.push(mesh);
    }
  }

  // add main planet window.planetsState.edges
  window.planetsState.edges = [];
  for (var p1 of window.planetsState.planets) {
    for (var p2 of window.planetsState.planets) {
      if (p1.isStar || p2.isStar) {
        continue;
      }
      if (p1 === p2) {
        continue;
      }

      var w = 1.0;
      var edge = [p1, p2, w];
      window.planetsState.edges.push(edge);
    }
  }
  createStars();
};

var createWalls = function () {
  var planeGeo = new THREE.PlaneGeometry(window.planetsConfig.scale * 2.0 + 0.1, window.planetsConfig.scale * 2.0 + 0.1);

  //var wallColor = 0x111111;
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

var createLights = function () {
  //scene.add(new THREE.AmbientLight(0x444444));
  var lights = [];
  var mainLight = new THREE.PointLight( 0xffffff, 1.5, 250 );
  mainLight.position.set(0.0, 0.0, window.planetsConfig.maxZ);
  lights.push(mainLight);

  /*var directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
  directionalLight.position.set( 0.5, 0.5, 0.5 ).normalize();
  scene.add( directionalLight );*/

  //var pointLight = new THREE.PointLight( 0xffffff, 2, 800 );
  //scene.add( pointLight );
  return lights;
};


var clamp = function (num, min, max) {
  return num < min ? min : (num > max ? max : num);
};

var reflect = function (reduction, position, speed) {
  var sr = speed / reduction;
  if (position + sr <= -1.0 ||
      position + sr >= 1.0) {
    if (position - sr <= -1.0 ||
        position - sr >= 1.0) {
      return [position, 0.0];
    } else {
      return [position - sr, -speed];
    }
  } else {
    return [position + sr, speed];
  }
};

var max = function (a, b) {
  return a > b ? a : b;
};

var min = function (a, b) {
  return a < b ? a : b;
};

var euclid = function (p1, p2) {
  var
    xd = p2.x - p1.x,
    yd = p2.y - p1.y,
    ret = {
      x: xd,
      y: yd,
      d: Math.sqrt(xd * xd + yd * yd)
    };
  return ret;
};

var updatePlanets = function () {
  var vs = [];
  for (var p of window.planetsState.planets) {
    var ve = {
      x: 0.0,
      y: 0.0,
      z: 0.0
    };
    vs[p.index] = ve;
  }

  // compute new velocities
  for (var edge of window.planetsState.edges) {
    var p1, p2, w;
    [p1, p2, w] = edge;
    var diff = {
      x: (p2.position.x - p1.position.x),
      y: (p2.position.y - p1.position.y),
      z: (p2.position.z - p1.position.z)
    };
    var pw = Math.pow;
    var dist = (pw(diff.x, 2.0) +
                         pw(diff.y, 2.0) +
                         pw(diff.z, 2.0));
    var F = p1.mass * p2.mass * w;
    if (p1.isStar || p2.isStar) {
      //F /= 100.0; //((1.0 + dist) * window.planetsConfig.starDistReduction);
      F = p1.parent.speed * dist / window.planetsConfig.starDistReduction;
    } else {
      F = dist / window.planetsConfig.distReduction;
    }
    vs[p1.index].x += (diff.x * F);
    vs[p1.index].y += (diff.y * F);
    vs[p1.index].z += (diff.z * F);
  }

  // adjust velocities
  for (var planet of window.planetsState.planets) {
    var v = vs[planet.index];

    // add random walk
    if (window.planetsConfig.randomWalk && !planet.isStar) {
      var rf = 500;
      v.x += randInit() / rf;
      v.y += randInit() / rf;
      v.z += randInit() / rf;
    }

    planet.velocity.x += v.x;
    planet.velocity.y += v.y;
    planet.velocity.z += v.z;

    //if (!planet.isStar) {
      var speed = Math.sqrt(planet.velocity.x * planet.velocity.x +
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
    //}
  }

  // update positions
  for (var planet2 of window.planetsState.planets) {
    // store old position
    if (window.planetsConfig.useTubes) {
      planet2.positions.push({
        x: planet2.position.x,
        y: planet2.position.y,
        z: planet2.position.z
      });
      if (planet2.positions.length > planet2.maxPositions) {
        planet2.positions.shift();
      }
    }

    // compute new
    var reduction = planet2.isStar ? window.planetsConfig.starSpeedReduction : window.planetsConfig.speedReduction;
    [planet2.position.x, planet2.velocity.x] = reflect(reduction, planet2.position.x, planet2.velocity.x);
    [planet2.position.y, planet2.velocity.y] = reflect(reduction, planet2.position.y, planet2.velocity.y);
    [planet2.position.z, planet2.velocity.z] = reflect(reduction, planet2.position.z, planet2.velocity.z);
  }
};

var Particles = function () {
  var geometry = new THREE.Geometry();

  var material =
    new THREE.ShaderMaterial({
      uniforms: {
        opacity: { type: "f", value: 1.0 }
      },
      attributes: {
        psize: { type: "f", value: [], needsUpdate: true },
        pcolor: { type: "c", value: [], needsUpdate: true },
        pcolor2: { type: "c", value: [], needsUpdate: true }
      },
      vertexShader: $("#vertexshaderParticles").text(),
      fragmentShader: $("#fragmentshaderParticles").text(),
      //blending: THREE.AdditiveBlending,
      //blending: THREE.MultiplyBlending,
      depthWrite: false,
      transparent: true
    });
  //material = new THREE.PointCloudMaterial( { size: 35, sizeAttenuation: false, alphaTest: 0.5, transparent: true } );
  var particleCloud = new THREE.PointCloud(geometry, material);

  this.setOpacity = function (o) {
    material.uniforms.opacity.value = o;
  };

  this.add = function (pt, size, color, color2) {
    var vertices = geometry.vertices;
    var idx = vertices.length;
    vertices.push(pt);
    /*} else {
      geometry[currentIndex] = pt;
      idx = currentIndex;
      currentIndex = (currentIndex + 1) % maxParticles
    }*/
    var vsize = material.attributes.psize.value;
    var vcolor = material.attributes.pcolor.value;
    var vcolor2 = material.attributes.pcolor2.value;
    vsize[idx] = size;
    vcolor[idx] = color;
    vcolor2[idx] = color2;
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

var BufferGeometry = function () {
  var geometry = new THREE.BufferGeometry();

  var length = 0;
  var stepSize = 1000;

  var vertices = new Float32Array(0);
  var material = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors });
  var mesh = new THREE.Line(geometry, material);

  this.addPoint = function (pos) {
    var stepLength = Math.ceil(length / stepSize) * stepSize;
    stepLength *= 3;
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
    vertices[length*3 + 0] = pos.x;
    vertices[length*3 + 1] = pos.y;
    vertices[length*3 + 2] = pos.z;
    geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
    length += 1;
  }

  this.addToScene = function (scene) {
    scene.add(mesh);
  }
};

var RenderTool = function () {
  var
    renderCount = 0,
    oldTubes = [],
    particles = new Particles(),
    oldParticles = [],
    oldConfig = $.extend({}, window.planetsConfig),
    scene,
    camera,
    screenScene,
    screenCamera,
    screenMaterial,
    rtBackBuffer1,
    rtBackBuffer2,
    rtScreen,
    renderer,
    walls = createWalls(),
    lights = createLights(),
    stats;

  var setup = function () {
    var gui = new dat.GUI();
    var varName;
    for (varName in window.planetsConfig) {
      gui.add(window.planetsConfig, varName);
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = window.planetsConfig.scale;
    for (var light of lights) {
      scene.add(light);
    }

    stats = new Stats();
    stats.domElement.style.position = "absolute";
    stats.domElement.style.top = "0px";
    var container = document.getElementById("statsContainer");
    container.appendChild(stats.domElement);

    screenScene = new THREE.Scene();
    screenCamera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 1000);
    //new THREE.OrthographicCamera( window.innerWidth / - 2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / - 2, -10000, 10000 );

    //screenCamera.position.z = 1;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    if (!debugCompute) {
      document.body.appendChild(renderer.domElement);
    }

    var controls = new THREE.OrbitControls(camera, renderer.domElement);

    rtBackBuffer1 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
    rtBackBuffer2 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
    rtScreen = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });

    var plane = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);

    screenMaterial =
      new THREE.ShaderMaterial({
        uniforms: {
          backbuffer: { type: "t", value: rtBackBuffer1 },
          screen: { type: "t", value: rtScreen },
          planetsTexture: { type: "t", value: null },
          resolution: { type: "v2", value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader: $("#vertexshader").text(),
        fragmentShader: $("#fragment_shader_screen").text(),
        depthWrite: false,
        transparent: true
      });

    var quad = new THREE.Mesh(plane, screenMaterial);

    quad.position.z = -1;

    screenScene.add(quad);
  };
  setup();

  var mapPositionToScene = function (p, position) {
    if (p.isStar) {
      position = {
        x: position.x * window.planetsConfig.starScale + p.parent.position.x,
        y: position.y * window.planetsConfig.starScale + p.parent.position.y,
        z: position.z * window.planetsConfig.starScale + p.parent.position.z
      };
    }
    return {
      x: position.x * window.planetsConfig.maxX,
      y: position.y * window.planetsConfig.maxY,
      z: window.planetsConfig.useZ ? (position.z * window.planetsConfig.maxZ) : 0.0
    };
  };

  var createTube = function (p) {
    var path = [];
    for (var pos of p.positions) {
      pos = mapPositionToScene(p, pos);
      var posVec3 = new THREE.Vector3(pos.x, pos.y, pos.z);
      path.push(posVec3);
    }
    if (path.length === 0) {
      return;
    }
    path = new THREE.SplineCurve3(path);
    var geometry = new THREE.TubeGeometry(
        path,  //path
        window.planetsConfig.tubeSegments,    //segments
        0.3,     //radius
        4,     //radiusSegments
        false  //closed
    );
    var tube = new THREE.Mesh(geometry, p.tubeMaterial);
    scene.add(tube);
    oldTubes.push(tube);
  };

  var updateMeshes = function (p, timeVal) {
    var t = p.lastMesh;
    var mesh = p.meshes[t];
    scene.add(mesh);
    if (mesh === undefined) {
      return;
    }
    var pos = mapPositionToScene(p, p.position);
    mesh.position.set(pos.x, pos.y, pos.z);

    var dir = new THREE.Vector3(
                mesh.position.x + p.velocity.x,
                mesh.position.y + p.velocity.y,
                mesh.position.z + p.velocity.z);
    mesh.lookAt(dir);

    var scale = window.planetsConfig.radiusScale;
    if (window.planetsConfig.usePlanetRadius) {
      scale *= p.radius;
    }
    mesh.scale.x = scale;
    mesh.scale.y = scale;
    mesh.scale.z = scale;

    var color = p.color;
    if (p.isStar && window.planetsConfig.useParentColor) {
      color = p.parent.color;
    }
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

  this.render = function () {
    var firstRender = (renderCount === 0);
    renderCount += 1;
    var i = 0;
    var newTime = (new Date().getTime()) / 1000.0;
    var timeVal = newTime - window.planetsState.startTime;

    if (oldConfig.planetCount !== window.planetsConfig.planetCount ||
        oldConfig.starCount !== window.planetsConfig.starCount) {
      createPlanets();
    }
    if (firstRender || oldConfig.useBackBuffer !== window.planetsConfig.useBackBuffer) {
      var wall;
      if (window.planetsConfig.useBackBuffer) {
        for (wall of walls) {
          scene.remove(wall);
        }
      } else {
        for (wall of walls) {
          scene.add(wall);
        }
      }
    }
    if (window.planetsConfig.useTubes) {
      for (var tube of oldTubes) {
        scene.remove(tube);
        //tube.dispose();
        tube.geometry.dispose();
        //material.dispose();
        //texture.dispose();
      }
      oldTubes = [];
    }

    if (window.planetsConfig.useParticles) {
      var pt;
      if (!window.planetsConfig.useParticleTrail) {
        particles.removeFromScene(scene);
        for (pt of oldParticles) {
          pt.removeFromScene(scene);
          oldParticles = [];
        }
      } else {
        oldParticles.push(particles);
        var ptIndex = 0;
        for (pt of oldParticles) {
          if (window.planetsConfig.usePTrailOpacity) {
            pt.setOpacity(ptIndex / oldParticles.length);
          } else {
            pt.setOpacity(1.0);
          }
          i++;
        }
      }
      particles = new Particles();
    } else {
      if (oldConfig.useParticles) {
        particles.removeFromScene(scene);
      }
    }

    for (var planet of window.planetsState.planets) {
      var pos = mapPositionToScene(planet, planet.position);
      if (window.planetsConfig.useTubes) {
        createTube(planet);
      }
      if (window.planetsConfig.useParticles) {
        pos = new THREE.Vector3(pos.x, pos.y, pos.z);
        var size = window.planetsConfig.radiusScale * 20.0;
        if (window.planetsConfig.usePlanetRadius) {
          size *= planet.radius;
        }
        var color = planet.color;
        if (planet.isStar && window.planetsConfig.useParentColor) {
          color = planet.parent.color;
        }
        particles.add(pos, size, color, planet.color2);
        particles.addToScene(scene);
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
        for (planet of window.planetsState.planets) {
          for (var mesh of planet.meshes) {
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
    var a = rtBackBuffer2;
    rtBackBuffer2 = rtBackBuffer1;
    rtBackBuffer1 = a;
    screenMaterial.uniforms.backbuffer.value = rtBackBuffer2;

    stats.update();
    oldConfig = $.extend({}, window.planetsConfig);
    requestAnimationFrame(() => this.render());
  };
};

var main = function () {
  window.planetsState = {
    planets: [],
    edges: [],
    meshMakers: [
      //MeshMaker.createMeshMaker("#fragmentshader1"),
      MeshMaker.createMeshMaker("#fragmentshader2")
      //MeshMaker.createMeshMaker("#fragmentshader3"),
      //MeshMaker.createMeshMaker("#fragmentshader4"),
      //MeshMaker.createMeshMaker("#fragmentshader5"),
      //MeshMaker.createMeshMaker("#fragmentshader6"),
    ],
    startTime: (new Date().getTime()) / 1000.0 - 500.0
  };

  createPlanets();

  if (debugCompute) {
    var computeShader = new ComputeShader(window.planetsState.planets);
    computeShader.compute();
  } else {
    updatePlanets();
    setInterval(updatePlanets, 10);
    var rt = new RenderTool();
    rt.render();
  }
};

$(main);
