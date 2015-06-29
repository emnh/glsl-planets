/*jshint esnext: true */

// noprotect

var planets = [];
var planetCount = 25;
var starCount = 25;
var maxSpeed = 0.01;
var minSpeed = 0.001;
var dist_reduction = 1.0e5;
var speed_reduction = 1.0;
var star_speed_reduction = 0.1;
var minDist = 0.001;
var trailLength = 200;
var starTrailLength = 1;
var memorizeGeometry = true;
var randomWalk = true;
var debugCompute = false;
var useBackBuffer = false;
var useShader = true;
var useTubes = false;
var tubeSegments = 20;

var SCALE = 20;
var maxX = 1.0 * SCALE / 2.0 * window.innerWidth / window.innerHeight;
var maxY = 1.0 * SCALE / 2.0;
var maxZ = 1.0 * SCALE;

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );
camera.position.z = SCALE;

var stats = new Stats();
stats.domElement.style.position = 'absolute';
stats.domElement.style.top = '0px';
var container = document.getElementById( 'statsContainer' );
container.appendChild( stats.domElement );

var controls = new THREE.OrbitControls(camera);

var screenScene = new THREE.Scene();
var screenCamera = new THREE.PerspectiveCamera( 100, window.innerWidth/window.innerHeight, 0.1, 1000 ); 
//new THREE.OrthographicCamera( window.innerWidth / - 2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / - 2, -10000, 10000 );
    
//screenCamera.position.z = 1;

var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
if (!debugCompute) {
  document.body.appendChild(renderer.domElement);
}

var rtBackBuffer1 = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat } );

var rtBackBuffer2 = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat } );

var rtScreen = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat } );

var plane = new THREE.PlaneGeometry( window.innerWidth, window.innerHeight );

//window.effect.material.transparent = true;

var screenMaterial =
    new THREE.ShaderMaterial({
      uniforms: {
        backbuffer: { type: "t", value: rtBackBuffer1 },
        screen: { type: "t", value: rtScreen  },
        planetsTexture: { type: "t", value: null },
        resolution: { type: "v2", value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      },
    vertexShader: $('#vertexshader').text(),
    fragmentShader: $('#fragment_shader_screen').text(),
    depthWrite: false,
      transparent: true
    });

var quad = new THREE.Mesh(plane, screenMaterial);

quad.position.z = -1;

screenScene.add(quad);

var ComputeShader = function() {
  var sq = Math.ceil(Math.sqrt(planets.length));
  var th = sq;
  var vec4PerPlanet = 6.0;
  var tw = sq * vec4PerPlanet;
  var outHeight = sq;
  var outWidth = sq;
  
  this.renderer = new THREE.WebGLRenderer();
  this.renderer.setSize(outWidth, outHeight);
  // XXX: for debug only
  document.body.appendChild(this.renderer.domElement);
  
  this.camera =  new THREE.PerspectiveCamera(100, outWidth/outHeight, 0.1, 1000);
  this.camera.position.z = 1;
  
  this.scene = new THREE.Scene();
  
  var fShader = "#define SQPLANET " + sq + ".0\n";
  fShader += "#define VEC4PERPLANET " + vec4PerPlanet + ".0\n";
  fShader += $('#fragment_shader_compute').text();
  
  this.material = 
    new THREE.ShaderMaterial({
      uniforms: {
        dist_reduction: { type: "f", value: dist_reduction },
        planetsTexture: { type: "t", value: null  },
        resolution: { type: "v2", value: new THREE.Vector2(tw, th) }
      },
    vertexShader: $('#vertexshader').text(),
    fragmentShader: fShader,
    depthWrite: false
    });
  
  var plane = new THREE.PlaneGeometry(sq, sq);
  var quad = new THREE.Mesh(plane, this.material);
  quad.position.z = -1;
  this.scene.add(quad);
  
  this.rtCompute = new THREE.WebGLRenderTarget(sq, sq, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
  
  // http://stackoverflow.com/questions/9882716/packing-float-into-vec4-how-does-this-code-work?rq=1
  // encodes a number between 0 and 1
  this.encodeFloat = function(depth) {
    var base = 255.0;
    var bit_shift = [base*base*base, base*base, base, 1.0];
    var bit_mask = [0.0, 1.0/base, 1.0/base, 1.0/base];
    var res = [
      (depth * bit_shift[0]) % 1.0,
      (depth * bit_shift[1]) % 1.0,
      (depth * bit_shift[2]) % 1.0,
      (depth * bit_shift[3]) % 1.0
    ];
    res = [(res[0] - res[0] * bit_mask[0]) * base,
               (res[1] - res[0] * bit_mask[1]) * base,
               (res[2] - res[1] * bit_mask[2]) * base,
               (res[3] - res[2] * bit_mask[3]) * base];
    return res;
  };
  
  this.decodeFloat = function(rgba_depth) {
    var base = 255.0;
    var bit_shift = [
      1.0/(base * base * base),
      1.0/(base * base),
      1.0/base,
      1.0];
    var depth = rgba_depth[0] * bit_shift[0] +
                rgba_depth[1] * bit_shift[1] +
                rgba_depth[2] * bit_shift[2] +
                rgba_depth[3] * bit_shift[3];
    return depth;
  };
  
  this.genTexture = function() {
    var rs = 4;
    var rOffset = 0;
    var gOffset = 1;
    var bOffset = 2;
    var aOffset = 3;
    var b = new Uint8Array(tw*th*rs);
    for (var planet of planets) {
      //if (planet.positions.length <= 0) continue;
      var i = planet.index * vec4PerPlanet * rs;
      var position = planet.position;
      var starScale = 15.0;
      /*if (planet.isStar) {
        position = {
            x: position.x / starScale + planet.parent.position.x,
            y: position.y / starScale + planet.parent.position.y,
            z: position.z / starScale + planet.parent.position.z
          };
      }*/
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
  
  this.getImageData = function(image) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    return context.getImageData(0, 0, image.width, image.height);
  };
  
  this.compute = function() {
    var texture = this.genTexture();
    this.material.uniforms.planetsTexture.value = texture;
    //this.renderer.render(scene, camera, this.rtCompute, true);
    this.renderer.render(this.scene, this.camera); //, null, true);
    //var img = this.getImageData(this.renderer.domElement);
  };
};


var MeshMaker = function(shader) {
  
  var scale = 1.0;
  //this.geometry = new THREE.BoxGeometry( 1/scale, 1/scale, 1/scale );
  //this.geometry = new THREE.TorusGeometry(0.5/scale, 0.25/scale, 16, 100);
  //this.geometry = new THREE.SphereGeometry( 0.03, 50, 50);
  this.geometry = new THREE.SphereGeometry( 0.3, 50, 50);
  var length = 1.0;

  //this.geometry = new THREE.CylinderGeometry( 0.3, 0.3, length, 50);
  // rotates the cylinder to initial position so it will rotate correctly with velocity
  //this.geometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, length / 2, 0 ) );
  //this.geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / 2 ) );

  //this.geometry = new THREE.IcosahedronGeometry(0.1);
 
  this.initMaterial = function() {
    var imgTexture = THREE.ImageUtils.loadTexture( "textures/lavatile.jpg");
    imgTexture.repeat.set( 4, 2 );
    imgTexture.wrapS = imgTexture.wrapT = THREE.RepeatWrapping;
    imgTexture.anisotropy = 16;
    this.imgTexture = imgTexture;

    var shininess = 50, specular = 0x333333, bumpScale = 1, shading = THREE.SmoothShading;
    
    var imgTexture2 = THREE.ImageUtils.loadTexture( "textures/moon_1024.jpg");
    imgTexture2.wrapS = imgTexture2.wrapT = THREE.RepeatWrapping;
    imgTexture2.anisotropy = 16;
    this.imgTexture2 = imgTexture2;
    
    //this.material = new THREE.MeshPhongMaterial( { map: imgTexture, bumpMap: imgTexture, bumpScale: bumpScale, color: 0xffffff, specular: specular, shininess: shininess, shading: shading } );
    this.material = new THREE.MeshPhongMaterial( { color: 0x2194ce, specular: 0x111111, shininess: 30 } );
  };

  this.initMaterial();
 
  this.initShader = function() {
    this.shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { type: "f", value: 0.0 },
        resolution: { type: "v2", value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        color: { type: "c", value: new THREE.Color(1.0, 1.0, 1.0) },
        material: { type: "t", value: this.imgTexture }
      },
      vertexShader:   $('#vertexshader').text(),
      fragmentShader: shader,
      transparent: true
    });
  }
  
  this.createMesh = function() {  
    if (useShader) {
      var mesh = new THREE.Mesh(this.geometry, this.shaderMaterial);
    } else {
      var mesh = new THREE.Mesh(this.geometry, this.material);
    }
    return mesh;
  };
    
};

var randInit = function() {
  return Math.random() * 2.0 - 1.0;
};

var createPlanet = function(index) {
  var planet = {
    index: index,
    position: {
      x: randInit(),
      y: randInit(),
      z: randInit()
    },
    velocity: {
      x: randInit() * maxSpeed,
      y: randInit() * maxSpeed,
      z: randInit() * maxSpeed
    },
    mass: Math.random(),
    radius: Math.random(),
    positions: [],
    meshes: [],
    lastMesh: 0,
    color: {
      r: Math.random(),
      g: Math.random(),
      b: Math.random()
    }
  };
  return planet;
};

// create planets
for (var i = 0; i < planetCount; i++) {
  var planet = createPlanet(i);
  planets.push(planet);
}

// add planet edges
var edges = [];
for (var p1 of planets) {
  for (var p2 of planets) {
    if (p1 == p2) continue;
    
    //if (i > j + 5) continue;
    var w = 1.0;
    var edge = [p1, p2, w];
    edges.push(edge);
  }
}

// add star formations
var starPlanets = [];
var index = planetCount;
for (var planet of planets) {
  var theseStars = [];
  for (var s = 0; s < starCount; s++) {
    star = createPlanet(index);
    index += 1;
    starPlanets.push(star);
    star.parent = planet;
    star.radius = planet.radius * 0.5;
    star.mass = 1.0;
    star.isStar = true;
    theseStars.push(star);
    var w = 1.0;
    var edge = [star, planet, w];
    //edges.push(edge);
  }
  for (var s2 of theseStars) {
    for (var s3 of theseStars) {
      if (s2 == s3) continue;
      var w = 1.0e5;
      var edge = [s2, s3, w];
      edges.push(edge);
    }
  }
}
for (var star of starPlanets) {
  planets.push(star);
}

var createWalls = function() {
  var planeGeo = new THREE.PlaneGeometry( SCALE*2.0 + 0.1, SCALE*2.0 + 0.1 );

  var wallColor = 0x111111;

  var planeTop = new THREE.Mesh( planeGeo, new THREE.MeshPhongMaterial( { color: wallColor } ) );
  planeTop.position.y = maxY;
  planeTop.rotateX( Math.PI / 2 );
  scene.add( planeTop );

  var planeBottom = new THREE.Mesh( planeGeo, new THREE.MeshPhongMaterial( { color: wallColor } ) );
  planeBottom.position.y = -maxY;
  planeBottom.rotateX( -Math.PI / 2 );
  scene.add( planeBottom );
  
  var planeBack = new THREE.Mesh( planeGeo, new THREE.MeshPhongMaterial( { color: wallColor } ) );
  planeBack.position.z = -maxZ;
  planeBack.position.y = 0.0;
  scene.add( planeBack );
  
  var planeFront = new THREE.Mesh( planeGeo, new THREE.MeshPhongMaterial( { color: wallColor } ) );
  planeFront.position.z = maxZ;
  planeFront.position.y = 0.0;
  planeFront.rotateY( Math.PI );
  scene.add( planeFront );
  
  var planeRight = new THREE.Mesh( planeGeo, new THREE.MeshPhongMaterial( { color: wallColor } ) );
  planeRight.position.x = maxX;
  planeRight.position.y = 0.0;
  planeRight.rotateY( - Math.PI / 2 );
  scene.add( planeRight );
  
  var planeLeft = new THREE.Mesh( planeGeo, new THREE.MeshPhongMaterial( { color: wallColor } ) );
  planeLeft.position.x = -maxX;
  planeLeft.position.y = 0.0;
  planeLeft.rotateY( Math.PI / 2 );
  scene.add( planeLeft );
};

var createScene = function() {
  var meshMakers = [];
  var shader = $('#fragmentshader1').text();
  var meshMaker1 = new MeshMaker(shader);
  //meshMakers.push(meshMaker1);
  var shader2 = $('#fragmentshader2').text();
  var meshMaker2 = new MeshMaker(shader2);
  meshMakers.push(meshMaker2);
  var shader3 = $('#fragmentshader3').text();
  var meshMaker3 = new MeshMaker(shader3);
  //meshMakers.push(meshMaker3);
  var shader4 = $('#fragmentshader4').text();
  var meshMaker4 = new MeshMaker(shader4);
  //meshMakers.push(meshMaker4);
  var shader5 = $('#fragmentshader5').text();
  var meshMaker5 = new MeshMaker(shader5);
  //meshMakers.push(meshMaker5);

  for (var p of planets) {
    meshMakers[p.index % meshMakers.length].initShader();
    if (p.isStar) {
      for (var t = 0; t < starTrailLength; t++) {
        var mesh = meshMakers[p.index % meshMakers.length].createMesh();
        p.meshes.push(mesh);
        if (!useTubes) {
          scene.add(mesh);
        }
      }
    } else {
      for (var t = 0; t < trailLength; t++) {
        var mesh = meshMakers[p.index % meshMakers.length].createMesh();
        p.meshes.push(mesh);
        if (!useTubes) {
          scene.add(mesh);
        }
      }
    }
  }
}

var createLights = function() {
  //scene.add(new THREE.AmbientLight(0x444444));
  var mainLight = new THREE.PointLight( 0xffffff, 1.5, 250 );
  mainLight.position.set(0.0, 0.0, maxZ);
  scene.add(mainLight);

  /*var directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
  directionalLight.position.set( 0.5, 0.5, 0.5 ).normalize();
  scene.add( directionalLight );*/

  //var pointLight = new THREE.PointLight( 0xffffff, 2, 800 );
  //scene.add( pointLight );
};

if (!useBackBuffer) {
  createWalls();
}
createScene();
createLights();

var startTime = (new Date().getTime()) / 1000.0 - 500.0;

renderer.autoClear = false;

var clamp = function(num, min, max) {
  return num < min ? min : (num > max ? max : num);
};

var reflect = function(reduction, position, speed) {
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

var max = function(a, b) {
  return a > b ? a : b;
};

var min = function(a, b) {
  return a < b ? a : b;
};

var euclid = function(p1, p2) {
  xd = p2.x - p1.x;
  yd = p2.y - p1.y;
  ret = {
    x: xd,
    y: yd,
    d: Math.sqrt(xd * xd + yd * yd)
  };
  return ret;
};

var updatePlanets = function() {  
  var vs = [];
  for (var p of planets) {
    var ve = {
      x: 0.0,
      y: 0.0,
      z: 0.0
    };
    vs[p.index] = ve;
  }
  
  // compute new velocities
  for (var edge of edges) {
    [p1, p2, w] = edge;
    var diff = {
      x: (p2.position.x - p1.position.x),
      y: (p2.position.y - p1.position.y),
      z: (p2.position.z - p1.position.z),
    };
    var pw = Math.pow;
    var dist = (pw(diff.x, 2.0) + 
                         pw(diff.y, 2.0) +
                         pw(diff.z, 2.0));
    var F = p1.mass * p2.mass * w;
    F = dist / dist_reduction;
    vs[p1.index].x += (diff.x * F);
    vs[p1.index].y += (diff.y * F);
    vs[p1.index].z += (diff.z * F);
  }
  
  // adjust velocities
  for (var planet of planets) {
    var v = vs[planet.index];
    
    // add random walk
    if (randomWalk && !planet.isStar) {
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
      if (speed > maxSpeed) {
        planet.velocity.x /= (speed / maxSpeed);
        planet.velocity.y /= (speed / maxSpeed);
        planet.velocity.z /= (speed / maxSpeed);
      }
    //}
  }
  
  // update positions
  for (var planet2 of planets) {
    // store old position
    planet2.positions.push({
      x: planet2.position.x,
      y: planet2.position.y,
      z: planet2.position.z
    });
    if (planet2.positions.length > planet2.meshes.length) {
      planet2.positions.shift();
    }
    
    // compute new
    var reduction = planet2.isStar ? star_speed_reduction : speed_reduction;
    [planet2.position.x, planet2.velocity.x] = reflect(reduction, planet2.position.x, planet2.velocity.x);    
    [planet2.position.y, planet2.velocity.y] = reflect(reduction, planet2.position.y, planet2.velocity.y);
    [planet2.position.z, planet2.velocity.z] = reflect(reduction, planet2.position.z, planet2.velocity.z);
  }
};

var bigGeometry = new THREE.Geometry();
var shader = $('#fragmentshader2').text();
var meshMaker = new MeshMaker(shader);
var bigMesh = new THREE.Mesh(bigGeometry, meshMaker.shaderMaterial);
//scene.add(bigMesh);
var renderCount = 0;
var oldTubes = [];

var render = function() {
  renderCount += 1;
  /*
  if (renderCount % 1000 == 0) {
    scene.remove(bigMesh);
    bigGeometry = new THREE.Geometry();
    bigMesh = new THREE.Mesh(bigGeometry, meshMaker.shaderMaterial);
    scene.add(bigMesh);
  }
  */
  var i = 0;
  var newTime = (new Date().getTime()) / 1000.0;
  var timeVal = newTime - startTime;
  var sc = (Math.sin(timeVal) + 1.0) * 20.0 + 10.0;
  //camera.position.z = sc;
  //camera.rotation.z = Math.sin(timeVal)*0.1;
  //var newGeometry = new THREE.Geometry();
  //scene.add(newGeometry);
  for (var tube of oldTubes) {
    scene.remove(tube);
    //tube.dispose();
    tube.geometry.dispose();
    //material.dispose();
    //texture.dispose();
  }
  oldTubes = [];
  for (var p of planets) {
    if (p.positions.length > 0) {
      var t = p.lastMesh;
      var mesh = p.meshes[t];

      var mapPositionToScene = function(position) {
        var starScale = 5.0*SCALE;
        if (p.isStar) {
          position = {
            x: position.x / starScale + p.parent.position.x,
            y: position.y / starScale + p.parent.position.y,
            z: position.z / starScale + p.parent.position.z
          };
        }
        return {
          x: position.x * maxX,
          y: position.y * maxY,
          z: position.z * maxZ
        };
      };

      var createTube = function() {
        var path = [];
        for (var pos of p.positions) {
          pos = mapPositionToScene(pos);
          var pos_vec3 = new THREE.Vector3(pos.x, pos.y, pos.z);
          path.push(pos_vec3);
        }
        path = new THREE.SplineCurve3(path);
        var geometry = new THREE.TubeGeometry(
            path,  //path
            tubeSegments,    //segments
            0.3,     //radius
            4,     //radiusSegments
            false  //closed
        );
        var tube = new THREE.Mesh(geometry, mesh.material);
        scene.add(tube);
        oldTubes.push(tube);
      };
      if (useTubes) {
        createTube();
      }

      var pos = mapPositionToScene(p.position);
      mesh.position.set(pos.x, pos.y, pos.z);
      
      var dir = new THREE.Vector3(
                  mesh.position.x + p.velocity.x, 
                  mesh.position.y + p.velocity.y,
                  mesh.position.z + p.velocity.z);
      mesh.lookAt(dir);

      var scale = 1.0 + p.radius * 0.0;
      mesh.scale.x = scale;
      mesh.scale.y = scale;
      mesh.scale.z = scale;

      if (mesh.material.uniforms !== undefined &&
          mesh.material.uniforms.time !== undefined) {
        mesh.material.uniforms.time.value = timeVal + p.index * 637;
        var color = p.color;
        if (p.isStar) {
          color = p.parent.color;
        }
        mesh.material.uniforms.color.value =
          new THREE.Color(color.r, 
                          color.g,
                          color.b);
      }
      p.lastMesh = (p.lastMesh + 1) % p.meshes.length;

      //mesh.updateMatrix();
      //bigGeometry.merge(mesh.geometry, mesh.matrix);
    }
    
    i += 1;
  }
  
  //var planetsTexture = genTexture();
  //screenMaterial.uniforms.planetsTexture.value = planetsTexture;

  if (!useBackBuffer) {
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
  requestAnimationFrame(render);
};

if (debugCompute) {
  var computeShader = new ComputeShader();
  computeShader.compute();
} else {
  updatePlanets();
  setInterval(updatePlanets, 10);
  render();  
}
