"use strict";

var gl, canvas, program, depthProgram, sunProgram;

var pointsArray = new Float32Array(0);
var normalsArray = new Float32Array(0);
var vertexCount = 0;
var texCoordsArray = new Float32Array(0);
var vBuffer, nBuffer, tBuffer, sunBuffer;
var texture;
var shadowFBO, shadowTexture;
var SHADOW_SIZE = 2048;

var n = 256;
var data = null;
var IMG_BASE = "https://raw.githubusercontent.com/turban/webgl-earth/master/images/";
var heightScale = 0.10;

var radius = 3.2;
var theta = 0.3, phi = 0.0;
var at = vec3(0, 0, 0);
var up = vec3(0, 1, 0);

var spin = 15, lightSpeed = 8, tilt = 23.5;
var earthAngle = 0, lightAngle = 50;

var lightPosition = vec4(1.0, 0.0, 1.0, 0.0);
var lightAmbient  = vec4(0.12, 0.12, 0.14, 1.0);
var lightDiffuse  = vec4(1.0, 1.0, 1.0, 1.0);
var lightSpecular = vec4(1.0, 1.0, 1.0, 1.0);
var materialShininess = 60.0;

var modelViewMatrix, projectionMatrix, viewMatrix, nMatrix;
var modelViewMatrixLoc, projectionMatrixLoc, nMatrixLoc;

var METERS_AT_255 = 8848;

function gridPoint(i, j) {
  var lon = radians(-180 + 360 * i / (2 * n));
  var lat = radians(-90 + 180 * j / n);
  var r = 1 + heightScale * data[i * (n + 1) + j] / 255;
  return vec4(r * Math.cos(lat) * Math.sin(lon),
              r * Math.sin(lat),
              r * Math.cos(lat) * Math.cos(lon), 1.0);
}

function gridTex(i, j) {
  return [i / (2 * n), j / n];
}

function configureTexture(image) {
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, "texture"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "shadowMap"), 1);
}

function createShadowMap() {
  shadowTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_SIZE, SHADOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);

  shadowFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function loadPoints(res) {
  n = res;
  var cells = 2 * n * n;
  var count = cells * 6;
  pointsArray = new Float32Array(count * 4);
  normalsArray = new Float32Array(count * 4);
  texCoordsArray = new Float32Array(count * 2);
  var p = 0;

  function push(v, nrm, tc) {
    pointsArray.set(v, p * 4);
    normalsArray.set(nrm, p * 4);
    texCoordsArray.set(tc, p * 2);
    p++;
  }
  function faceNormal(a, b, c) {

    var t1 = subtract(b, a), t2 = subtract(c, a);
    var nrm = cross(t1, t2);
    if (length(nrm) === 0) nrm = [a[0], a[1], a[2]];
    nrm = normalize(nrm);
    return vec4(nrm[0], nrm[1], nrm[2], 0.0);
  }

  for (var i = 0; i < 2 * n; i++) {
    for (var j = 0; j < n; j++) {
      var a = gridPoint(i, j);
      var b = gridPoint(i + 1, j);
      var c = gridPoint(i + 1, j + 1);
      var d = gridPoint(i, j + 1);

      var ta = gridTex(i, j), tb = gridTex(i + 1, j), tc = gridTex(i + 1, j + 1), td = gridTex(i, j + 1);

      var n1 = faceNormal(a, b, c);
      push(a, n1, ta); push(b, n1, tb); push(c, n1, tc);

      var n2 = faceNormal(c, d, a);
      push(c, n2, tc); push(d, n2, td); push(a, n2, ta);
    }
  }
  vertexCount = count;
}

function uploadBuffers() {
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pointsArray, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, normalsArray, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, tBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoordsArray, gl.STATIC_DRAW);
}

window.onload = function init() {
  canvas = document.getElementById("gl-canvas");
  gl = WebGLUtils.setupWebGL(canvas);
  if (!gl) { alert("WebGL isn't available"); return; }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1.0, 1.0, 1.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  program = initShaders(gl, "vertex-shader", "fragment-shader");
  depthProgram = initShaders(gl, "depth-vertex-shader", "depth-fragment-shader");
  sunProgram = initShaders(gl, "sun-vertex-shader", "sun-fragment-shader");
  gl.useProgram(program);
  createShadowMap();

  nBuffer = gl.createBuffer();
  vBuffer = gl.createBuffer();
  tBuffer = gl.createBuffer();
  sunBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sunBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(vec4(0, 0, 0, 1)), gl.STATIC_DRAW);

  modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
  projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
  nMatrixLoc = gl.getUniformLocation(program, "normalMatrix");

  gl.uniform4fv(gl.getUniformLocation(program, "lightAmbient"), flatten(lightAmbient));
  gl.uniform4fv(gl.getUniformLocation(program, "lightDiffuse"), flatten(lightDiffuse));
  gl.uniform4fv(gl.getUniformLocation(program, "lightSpecular"), flatten(lightSpecular));

  setupUI();

  var names = ["elev_bump_4k.jpg", "water_4k.png", "2_no_clouds_4k.jpg"];
  var imgs = [], loaded = 0;
  names.forEach(function (name, k) {
    var im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = function () {
      loaded++;
      if (loaded === names.length) start(imgs);
    };
    im.onerror = function () {
      document.getElementById("info").textContent = "이미지를 불러오지 못했습니다: " + name;
    };
    im.src = IMG_BASE + name;
    imgs[k] = im;
  });
};

function readGray(image, w, h) {
  var c = document.createElement("canvas");
  c.width = w; c.height = h;
  var ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function start(imgs) {
  var w = 2 * n + 1, h = n + 1;
  var elev = readGray(imgs[0], w, h);
  var water = readGray(imgs[1], w, h);
  data = new Array(w * h);
  for (var i = 0; i < w; i++) {
    for (var j = 0; j < h; j++) {
      var p = ((h - 1 - j) * w + i) * 4;
      var v = 0;
      if (water[p] < 128) {
        v = Math.round((elev[p] - 23) / 231 * 255);
        v = Math.max(0, Math.min(255, v));
      }
      data[i * h + j] = v;
    }
  }
  loadPoints(n);
  uploadBuffers();
  configureTexture(imgs[2]);
  var sl = document.getElementById("slider7");
  sl.oninput({ target: sl });
  render();
}

function setupUI() {
  function slider(id, outId, fmt, apply) {
    var el = document.getElementById(id), out = document.getElementById(outId);
    el.oninput = function (e) { apply(parseFloat(e.target.value)); out.textContent = fmt(parseFloat(e.target.value)); };
    el.oninput({ target: el });
    return el;
  }
  slider("slider0", "vTheta", function (v) { return v.toFixed(2); }, function (v) { theta = v; });
  slider("slider1", "vPhi", function (v) { return v.toFixed(2); }, function (v) { phi = v; });
  slider("slider4", "vSpin", function (v) { return v; }, function (v) { spin = v; });
  slider("slider5", "vLight", function (v) { return v; }, function (v) { lightSpeed = v; });
  slider("slider6", "vTilt", function (v) { return v.toFixed(1); }, function (v) { tilt = v; });

  var lat = 27.99, lon = 86.93;
  var info = document.getElementById("info");
  function query() {
    if (!data) return;
    var i = Math.round((lon + 180) / 360 * 2 * n), j = Math.round((lat + 90) / 180 * n);
    var v = data[i * (n + 1) + j];
    info.textContent = v === 0 ? "해수면 (0 m)"
      : "고도 값 " + v + "/255 ≈ " + Math.round(v / 255 * METERS_AT_255) + " m (칸 평균)";
  }
  slider("slider7", "vLat", function (v) { return v.toFixed(1); }, function (v) { lat = v; query(); });
  slider("slider8", "vLon", function (v) { return v.toFixed(1); }, function (v) { lon = v; query(); });
}

var last = performance.now();

function render(now) {
  now = now || performance.now();
  var dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  earthAngle = (earthAngle + spin * dt) % 360;
  lightAngle = (lightAngle + lightSpeed * dt) % 360;

  var eye = vec3(radius * Math.cos(theta) * Math.sin(phi),
                 radius * Math.sin(theta),
                 radius * Math.cos(theta) * Math.cos(phi));
  viewMatrix = lookAt(eye, at, up);
  projectionMatrix = perspective(40, canvas.width / canvas.height, 0.5, 20);
  var model = mult(rotateZ(tilt), rotateY(earthAngle));
  modelViewMatrix = mult(viewMatrix, model);
  nMatrix = normalMatrix(modelViewMatrix, true);

  var a = radians(lightAngle), e = radians(10);
  var Lw = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  var Le = mult(viewMatrix, vec4(Lw[0], Lw[1], Lw[2], 0.0));
  lightPosition = vec4(Le[0], Le[1], Le[2], 0.0);

  var lightView = lookAt(vec3(Lw[0] * 3, Lw[1] * 3, Lw[2] * 3), at, up);
  var lightProj = ortho(-1.3, 1.3, -1.3, 1.3, 0.5, 5.5);
  var lightMatrix = mult(lightProj, mult(lightView, model));

  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
  gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
  gl.clearColor(1.0, 1.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(depthProgram);
  gl.disable(gl.CULL_FACE);
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  var dPos = gl.getAttribLocation(depthProgram, "vPosition");
  gl.vertexAttribPointer(dPos, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(dPos);
  gl.uniformMatrix4fv(gl.getUniformLocation(depthProgram, "lightMatrix"), false, flatten(lightMatrix));
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  gl.enable(gl.CULL_FACE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
  var vNormal = gl.getAttribLocation(program, "vNormal");
  gl.vertexAttribPointer(vNormal, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vNormal);
  gl.bindBuffer(gl.ARRAY_BUFFER, tBuffer);
  var vTexCoord = gl.getAttribLocation(program, "vTexCoord");
  gl.vertexAttribPointer(vTexCoord, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vTexCoord);
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  var vPosition = gl.getAttribLocation(program, "vPosition");
  gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vPosition);

  gl.uniform1f(gl.getUniformLocation(program, "shadowOn"), 1.0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "lightMatrix"), false, flatten(lightMatrix));
  gl.uniform1f(gl.getUniformLocation(program, "heightScale"), heightScale);
  gl.uniform1f(gl.getUniformLocation(program, "shininess"), materialShininess);
  gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
  gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));
  gl.uniformMatrix3fv(nMatrixLoc, false, flatten(nMatrix));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

  gl.useProgram(sunProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, sunBuffer);
  var sp = gl.getAttribLocation(sunProgram, "sunPosition");
  gl.vertexAttribPointer(sp, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(sp);
  gl.uniformMatrix4fv(gl.getUniformLocation(sunProgram, "viewMatrix"), false, flatten(viewMatrix));
  gl.uniformMatrix4fv(gl.getUniformLocation(sunProgram, "projectionMatrix"), false, flatten(projectionMatrix));
  gl.uniform3f(gl.getUniformLocation(sunProgram, "sunOffset"), Lw[0] * 1.5, Lw[1] * 1.5, Lw[2] * 1.5);
  gl.drawArrays(gl.POINTS, 0, 1);

  requestAnimFrame(render);
}
