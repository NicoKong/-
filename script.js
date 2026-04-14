const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- 物理与渲染基础参数 ---
let isRunning = false;
let speedMultiplier = 1.0; 
let showAxes = true;

// 物理引擎常数重构：1单位质量 = 1太阳质量，1单位半径 = 1太阳半径
// 为了维持之前好看的轨道形状，我们大幅提高内部 G 值以抵消质量数值的缩小 (原来M=100，现在M=1)
const G = 5000; 
const dt = 0.05; 
const softening = 5; 
const VISUAL_RADIUS_MULTI = 8; // 1太阳半径 = 8 屏幕像素

// --- 摄像机系统 (控制平移和缩放) ---
let camera = { x: 0, y: 0, zoom: 1.0 };

class Body {
    constructor(x, y, vx, vy, mass, color, radius, id) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.mass = mass; // 太阳质量 M⊙
        this.color = color;
        this.radius = radius; // 太阳半径 R⊙
        this.id = id;
        this.path = [];
    }

    draw() {
        const visualR = this.radius * VISUAL_RADIUS_MULTI;
        ctx.beginPath();
        ctx.arc(this.x, this.y, visualR, 0, Math.PI * 2);
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

let bodies = [];

function initBodies() {
    // 逻辑原点 (0,0) 就是宇宙中心
    camera = { x: 0, y: 0, zoom: 1.0 };
    bodies = [
        new Body(-150, 0, 0, 1.5, 1.0, '#ff4d4d', 1.0, 0),
        new Body(150, 0, 0, -1.5, 1.0, '#4da6ff', 1.0, 1),
        new Body(0, 100, -1.5, 0, 1.0, '#ffcc00', 1.0, 2)
    ];
    updateUIFromData();
}

function updatePhysics() {
    const currentDt = dt * speedMultiplier; 
    for (let i = 0; i < bodies.length; i++) {
        let fx = 0, fy = 0;
        for (let j = 0; j < bodies.length; j++) {
            if (i === j) continue;
            const dx = bodies[j].x - bodies[i].x;
            const dy = bodies[j].y - bodies[i].y;
            const distSq = dx * dx + dy * dy + softening;
            const dist = Math.sqrt(distSq);
            const force = (G * bodies[i].mass * bodies[j].mass) / distSq;
            fx += force * (dx / dist);
            fy += force * (dy / dist);
        }
        bodies[i].vx += (fx / bodies[i].mass) * currentDt;
        bodies[i].vy += (fy / bodies[i].mass) * currentDt;
    }

    for (let i = 0; i < bodies.length; i++) {
        bodies[i].x += bodies[i].vx * currentDt;
        bodies[i].y += bodies[i].vy * currentDt;

        if (Math.random() < 0.2) {
            bodies[i].path.push({x: bodies[i].x, y: bodies[i].y});
            if (bodies[i].path.length > 300) bodies[i].path.shift();
        }
    }
}

function drawPaths() {
    for (let i = 0; i < bodies.length; i++) {
        if(bodies[i].path.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(bodies[i].path[0].x, bodies[i].path[0].y);
        for (let p = 1; p < bodies[i].path.length; p++) {
            ctx.lineTo(bodies[i].path[p].x, bodies[i].path[p].y);
        }
        ctx.strokeStyle = bodies[i].color;
        ctx.lineWidth = 1.5 / camera.zoom; 
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// --- 自适应坐标轴计算核心 ---
function drawAxes() {
    if (!showAxes) return;

    // 获取当前屏幕对应的物理坐标边界
    const left = screenToWorld(0, 0).x;
    const right = screenToWorld(canvas.width, 0).x;
    const top = screenToWorld(0, 0).y;
    const bottom = screenToWorld(0, canvas.height).y;

    // 期望每隔大概 120 像素画一条刻度线
    const targetIntervalWorld = 120 / camera.zoom; 
    
    // 算法：寻找最接近 targetIntervalWorld 的 1, 2, 5 整数倍间隔
    const log10 = Math.floor(Math.log10(targetIntervalWorld));
    const pow10 = Math.pow(10, log10);
    const fraction = targetIntervalWorld / pow10;
    
    let niceMultiplier = 1;
    if (fraction < 1.5) niceMultiplier = 1;
    else if (fraction < 3.5) niceMultiplier = 2;
    else if (fraction < 7.5) niceMultiplier = 5;
    else niceMultiplier = 10;
    
    const interval = niceMultiplier * pow10; // 最终完美的刻度间隔

    ctx.save();
    ctx.lineWidth = 1 / camera.zoom;
    ctx.font = `${12 / camera.zoom}px sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 画网格线和数字
    const startX = Math.ceil(left / interval) * interval;
    for (let x = startX; x <= right; x += interval) {
        ctx.beginPath();
        // 主坐标轴加粗，其他半透明
        ctx.strokeStyle = Math.abs(x) < 0.001 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
        ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.fillText(Number(x.toFixed(2)).toString(), x, camera.y + 5 / camera.zoom); // 刻度数字跟着屏幕中心走
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const startY = Math.ceil(top / interval) * interval;
    for (let y = startY; y <= bottom; y += interval) {
        ctx.beginPath();
        ctx.strokeStyle = Math.abs(y) < 0.001 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
        ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        if(Math.abs(y) > 0.001) ctx.fillText(Number(y.toFixed(2)).toString(), camera.x + 5 / camera.zoom, y);
    }
    
    ctx.restore();
}

function animate() {
    if (isRunning) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for(let step = 0; step < 5; step++) updatePhysics();
    } else {
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // --- 应用摄像机矩阵变换 ---
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2); // 屏幕中心作为缩放基点
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y); // 平移偏移量

    drawAxes();
    drawPaths();
    for (let i = 0; i < bodies.length; i++) bodies[i].draw();

    ctx.restore(); 

    requestAnimationFrame(animate);
}

/* ================== 坐标转换与交互逻辑 ================== */

// 屏幕坐标 -> 物理坐标
function screenToWorld(sx, sy) {
    return {
        x: (sx - canvas.width / 2) / camera.zoom + camera.x,
        y: (sy - canvas.height / 2) / camera.zoom + camera.y
    };
}

// 物理坐标 -> 屏幕坐标
function worldToScreen(wx, wy) {
    return {
        x: (wx - camera.x) * camera.zoom + canvas.width / 2,
        y: (wy - camera.y) * camera.zoom + canvas.height / 2
    };
}

let draggedBody = null;
let isDraggingCamera = false;
let lastMousePos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPos = screenToWorld(sx, sy);
    lastMousePos = { x: sx, y: sy };

    // 优先判断是否点中星体
    for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        const visualR = b.radius * VISUAL_RADIUS_MULTI;
        const dx = worldPos.x - b.x;
        const dy = worldPos.y - b.y;
        const hitTolerance = (visualR + 10) / camera.zoom; 
        
        if (dx * dx + dy * dy <= hitTolerance * hitTolerance) {
            draggedBody = b;
            if(isRunning) btnToggle.click(); 
            b.path = []; b.vx = 0; b.vy = 0; 
            return;
        }
    }
    // 没点中星体，则开始拖拽相机背景
    isDraggingCamera = true;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (draggedBody) {
        const worldPos = screenToWorld(sx, sy);
        draggedBody.x = worldPos.x;
        draggedBody.y = worldPos.y;
    } else if (isDraggingCamera) {
        const dx = sx - lastMousePos.x;
        const dy = sy - lastMousePos.y;
        camera.x -= dx / camera.zoom;
        camera.y -= dy / camera.zoom;
        lastMousePos = { x: sx, y: sy };
    } else {
        // 判定鼠标样式
        const worldPos = screenToWorld(sx, sy);
        let hovering = false;
        for (let b of bodies) {
            const dx = worldPos.x - b.x; const dy = worldPos.y - b.y;
            const hitTol = (b.radius * VISUAL_RADIUS_MULTI + 10) / camera.zoom;
            if (dx * dx + dy * dy <= hitTol * hitTol) { hovering = true; break; }
        }
        canvas.style.cursor = hovering ? 'pointer' : (isDraggingCamera ? 'grabbing' : 'grab');
    }
});

window.addEventListener('mouseup', () => {
    draggedBody = null;
    isDraggingCamera = false;
    canvas.style.cursor = 'grab';
});

// 鼠标滚轮缩放以屏幕中心为基准
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) camera.zoom *= 1.1; 
    else camera.zoom /= 1.1;
    camera.zoom = Math.max(0.05, Math.min(camera.zoom, 20.0));
}, { passive: false });


/* ================== UI 控制逻辑 ================== */

const btnToggle = document.getElementById('btn-toggle');
const btnReset = document.getElementById('btn-reset');

btnToggle.addEventListener('click', () => {
    isRunning = !isRunning;
    btnToggle.textContent = isRunning ? "暂停模拟" : "开始/继续";
    btnToggle.className = isRunning ? "btn-pause" : "btn-play";
});

btnReset.addEventListener('click', () => {
    isRunning = false;
    btnToggle.textContent = "开始模拟";
    btnToggle.className = "btn-play";
    initBodies();
});

document.getElementById('show-axes').addEventListener('change', (e) => {
    showAxes = e.target.checked;
});

document.getElementById('sim-speed').addEventListener('input', (e) => {
    speedMultiplier = Number(e.target.value);
    document.getElementById('speed-val').textContent = speedMultiplier.toFixed(1);
});

// 滑块和数字输入框的双向绑定同步
function setupUIBindings() {
    for (let i = 0; i < 3; i++) {
        const mSlide = document.getElementById(`m-slide-${i}`);
        const mNum = document.getElementById(`m-num-${i}`);
        const rSlide = document.getElementById(`r-slide-${i}`);
        const rNum = document.getElementById(`r-num-${i}`);

        // 滑块改变 -> 同步给输入框和物理实体
        mSlide.addEventListener('input', (e) => {
            mNum.value = e.target.value;
            bodies[i].mass = Number(e.target.value);
        });
        rSlide.addEventListener('input', (e) => {
            rNum.value = e.target.value;
            bodies[i].radius = Number(e.target.value);
        });

        // 输入框手动输入 -> 同步给滑块和物理实体
        mNum.addEventListener('input', (e) => {
            let val = Number(e.target.value);
            if(val > 0) {
                mSlide.value = val;
                bodies[i].mass = val;
            }
        });
        rNum.addEventListener('input', (e) => {
            let val = Number(e.target.value);
            if(val > 0) {
                rSlide.value = val;
                bodies[i].radius = val;
            }
        });
    }
}

function updateUIFromData() {
    for (let i = 0; i < 3; i++) {
        document.getElementById(`m-slide-${i}`).value = bodies[i].mass;
        document.getElementById(`m-num-${i}`).value = bodies[i].mass;
        document.getElementById(`r-slide-${i}`).value = bodies[i].radius;
        document.getElementById(`r-num-${i}`).value = bodies[i].radius;
    }
}

// 启动
initBodies();
setupUIBindings();
animate();
