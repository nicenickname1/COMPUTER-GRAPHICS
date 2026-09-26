"use strict";

var canvas;
var gl;

var points = [];

var NumTimesToSubdivide = 3;
var colorLoc;

window.onload = function init()
{
    canvas = document.getElementById( "gl-canvas" );

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }


    var vertices = [
        vec2( -1, -1 ),
        vec2(  1, -1 ),
        vec2(  -1, 1 ),
        vec2(  1, 1  )
    ];

    divideSquare( vertices[0], vertices[1], vertices[2], vertices[3],
                    NumTimesToSubdivide);


    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 1.0, 1.0, 1.0, 1.0 );

 
    var program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );

    colorLoc = gl.getUniformLocation(program, "uColor");
    gl.uniform4f(colorLoc, 1.0, 0.0, 0.0, 1.0);

    document.getElementById("red").onclick = function(){setColor(1, 0, 0);};
    document.getElementById("green").onclick = function(){setColor(0, 1, 0);};
    document.getElementById("blue").onclick = function(){setColor(0, 0, 1);};


    var bufferId = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, bufferId );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );

 
    var vPosition = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPosition, 2, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPosition );

    document.getElementById("slider").oninput = function(){
        NumTimesToSubdivide = Number(this.value);
        document.getElementById("countText").textContent = this.value;

        points = [];
        divideSquare( vertices[0], vertices[1], vertices[2], vertices[3],
                      NumTimesToSubdivide );
        gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );
        render();
    };
    render();
};

function Square( a, b, c, d )
{
    points.push( a, b, c,  b, c, d );
}

function divideSquare( a, b, c, d, count )
{



    if ( count === 0 ) {
        Square( a, b, c, d );
    }
    else {



        var w = (b[0] - a[0]) / 3
        var h = (c[1] - a[1]) / 3

        --count;

        for(var i = 0; i < 3; i++){
            for(var j = 0; j < 3; j++){
                if (i == 1 && j == 1) continue;

                var p = vec2( a[0] + i*w, a[1] + j*h );
                divideSquare( p,
                              vec2( p[0] + w, p[1]     ),
                              vec2( p[0],     p[1] + h ),
                              vec2( p[0] + w, p[1] + h ),
                              count );
            }
        }
    }
}

function render()
{
    gl.clear( gl.COLOR_BUFFER_BIT );
    gl.drawArrays( gl.TRIANGLES, 0, points.length );
}

function setColor(r, g, b){
    gl.uniform4f(colorLoc, r, g, b, 1.0);
    render();
}