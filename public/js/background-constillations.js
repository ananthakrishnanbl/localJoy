
const NUM_POINTS = 50;
const EDGE_PROBABILITY = 0.05; // 15% chance of an edge
const VANISHING_PROBABILITY = 0.01; // 15% chance of an edge

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();

// Generate 50 points within the browser window
const points = [];

for (let i = 0; i < NUM_POINTS; i++) {
    const px = Math.random() * window.innerWidth;
    const py = Math.random() * window.innerHeight;

    const vx = Math.random() * 2 - 1; // Range: -2 to 2
    const vy = Math.random() * 2 - 1; // Range: -2 to 2

    points.push({ px, py, vx, vy });
}

// Create a 50 x 50 adjacency matrix initialized with zeros
const adjacencyMatrix = Array.from(
    { length: NUM_POINTS },
    () => Array(NUM_POINTS).fill(0)
);

// Generate random undirected edges
for (let i = 0; i < NUM_POINTS; i++) {
    for (let j = i + 1; j < NUM_POINTS; j++) {
        if (Math.random() < EDGE_PROBABILITY) {
            adjacencyMatrix[i][j] = 1;
            adjacencyMatrix[j][i] = 1;
        }
    }
}

// Display results
console.log("Points:", points);
console.log("Adjacency Matrix:", adjacencyMatrix);

// Example: access the first point
console.log("First point:", points[0]);

// Example: check whether an edge exists between points 0 and 1
console.log("Edge between 0 and 1:", adjacencyMatrix[0][1]);

let draw=false;

function stopDraw(){
    draw=true;
}

function startDraw(){
    draw=true;
}
let x=1;
function drawEdges() {
    ctx.strokeStyle = "rgba(100, 160, 220, 0.15)";
    ctx.lineWidth = 0.5;

    for (let i = 0; i < NUM_POINTS; i++) {
        for (let j = i + 1; j < NUM_POINTS; j++) {
            if (adjacencyMatrix[i][j] === 1) {
                if(x%5==0 && Math.random() < VANISHING_PROBABILITY){
                    adjacencyMatrix[i][j]=0;
                    adjacencyMatrix[j][i]=0;
                    continue;
                    x=1;
                }
                ctx.beginPath();
                ctx.moveTo(points[i].px, points[i].py);
                ctx.lineTo(points[j].px, points[j].py);
                ctx.stroke();
            }
            else if(x%5==0 && Math.random() < VANISHING_PROBABILITY){
                adjacencyMatrix[i][j]=1;
                adjacencyMatrix[j][i]=1;
                ctx.beginPath();
                ctx.moveTo(points[i].px, points[i].py);
                ctx.lineTo(points[j].px, points[j].py);
                ctx.stroke();
                x=1;
            }
        }
    }
}

function updatePoints() {
    const radius = 1;

    for (const point of points) {
        point.px += point.vx;
        point.py += point.vy;

        // Left and right boundaries
        if (point.px + radius >= canvas.width) {
            point.px = canvas.width - radius;
            point.vx = -Math.abs(point.vx);
        } else if (point.px - radius <= 0) {
            point.px = radius;
            point.vx = Math.abs(point.vx);
        }

        // Top and bottom boundaries
        if (point.py + radius >= canvas.height) {
            point.py = canvas.height - radius;
            point.vy = -Math.abs(point.vy);
        } else if (point.py - radius <= 0) {
            point.py = radius;
            point.vy = Math.abs(point.vy);
        }
    }
}

function drawPoints() {
    for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.px, point.py, 1, 0, Math.PI * 2);

        ctx.fillStyle = "#60D5FA";
        ctx.fill();

        // Small glow around each point
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#60D5FA";
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// Animation loop
function animate() {
    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update positions
    updatePoints();

    // Draw edges first, then vertices
    drawEdges();
    drawPoints();
    if(draw){
        requestAnimationFrame(animate);
    }
}

startDraw();
animate();

window.addEventListener("resize", () => {
    resizeCanvas();

    // Keep existing points and adjust any outside the new canvas
    for (const point of points) {
        point.px = Math.max(4, Math.min(point.px, canvas.width - 4));
        point.py = Math.max(4, Math.min(point.py, canvas.height - 4));
    }
});