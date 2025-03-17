const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d");

window.addEventListener("resize", e => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
})

class Particle {
    #position = [0, 0];
    #positionPrevious = [0, 0];
    #velocity = [0, 0];

    constructor(positionX, positionY, velocityX, velocityY) {
        this.#position = [positionX, positionY];
        this.#positionPrevious = [positionX, positionY];
        this.#velocity = [velocityX, velocityY];

        this.selected = 0;
    }

    get position() {
        return this.#position;
    }

    set position(newPosition) {
        this.#position = newPosition;
    }

    get positionPrevious() {
        return this.#positionPrevious;
    }

    set positionPrevious(newPosition) {
        this.#positionPrevious = newPosition;
    }

    get velocity() {
        return this.#velocity;
    }

    set velocity(newVelocity) {
        this.#velocity = newVelocity;
    }
}

class GraphicsSettings {
    constructor() {
        this.lineWidth = 0;
        this.lineColour = "rgba(255, 255, 255, 0)";
        this.particleSize = 3;
        this.minSpeed = 0;
        this.maxSpeed = 2000;
        this.velocityRange = [350, 110]; // "colorramp" [hue_for_min_speed, hue_for_max_speed]
    }

    getLineWidth() {
        return this.lineWidth;
    }

    getLineColour() {
        return this.lineColour;
    }

    getParticleRadius() {
        return this.particleSize;
    }

    getParticleColour(particle) {
        let magnitude = Math.sqrt(particle.velocity[0] * particle.velocity[0] + particle.velocity[1] * particle.velocity[1]);
        magnitude = Math.min(this.maxSpeed, Math.max(this.minSpeed, magnitude));

        let hue = this.velocityRange[0] + (this.velocityRange[1] - this.velocityRange[0]) * (magnitude - this.minSpeed) / (this.maxSpeed - this.minSpeed);

        return particle.selected ? "white" : `hsla(${hue}, 100%, 50%, 1)`;
    }
}

class HashGrid {
    constructor(maxItems, spacing) {
        this.tableSize = 3 * maxItems; // maybe also 2 * maxItems
        this.cellSize = spacing;

        this.count = new Int32Array(this.tableSize + 1);
        this.condensedArray = new Int32Array(maxItems);

        this.queryCount = 0;
        this.queryResultArray = new Int32Array(maxItems);
    }

    static hash(xi, yi, tableSize) {
        var h = (xi * 92837111) ^ (yi * 689287499);
        return Math.abs(h) % tableSize;
    }

    intCoords(coord) {
        return Math.floor(coord / this.cellSize);
    }

    hashPosition(position) {
        const xi = this.intCoords(position[0]);
        const yi = this.intCoords(position[1]);
        return HashGrid.hash(xi, yi, this.tableSize);
    }

    update(particles) {
        this.count.fill(0);
        this.condensedArray.fill(0);

        particles.forEach(particle => {
            this.count[this.hashPosition(particle.position)] += 1;
        })

        for (let i = 1; i < this.tableSize + 1; i++) {
            this.count[i] = this.count[i - 1] + this.count[i];
        }

        particles.forEach((particle, index) => {
            const hash = this.hashPosition(particle.position);
            this.condensedArray[--this.count[hash]] = index;
        })
    }

    query(position, radius) { // too slow, which is sad
        const xMin = this.intCoords(position[0] - radius);
        const xMax = this.intCoords(position[0] + radius);
        const yMin = this.intCoords(position[1] - radius);
        const yMax = this.intCoords(position[1] + radius);

        function* queryIterator(count, condensedArray, tableSize) {
            for (let xi = xMin; xi <= xMax; xi++) {
                for (let yi = yMin; yi <= yMax; yi++) {
                    const hash = HashGrid.hash(xi, yi, tableSize);

                    const startIndex = count[hash];
                    const endIndex = count[hash + 1];

                    for (let i = startIndex; i < endIndex; i++) {
                        yield condensedArray[i];
                    }
                }
            }
        };

        return queryIterator(this.count, this.condensedArray, this.tableSize);
    }

    queryWithoutIterator(position) {
        this.queryCount = 0;

        const xMin = this.intCoords(position[0]) - 1;
        const xMax = this.intCoords(position[0]) + 1;
        const yMin = this.intCoords(position[1]) - 1;
        const yMax = this.intCoords(position[1]) + 1;

        for (let xi = xMin; xi <= xMax; xi++) {
            for (let yi = yMin; yi <= yMax; yi++) {
                const hash = HashGrid.hash(xi, yi, this.tableSize);

                const startIndex = this.count[hash];
                const endIndex = this.count[hash + 1];

                for (let i = startIndex; i < endIndex; i++) {
                    this.queryResultArray[this.queryCount++] = this.condensedArray[i];
                }
            }
        }
    }
}

export class Fluid {
    constructor(numParticles) {
        this.particles = []
        this.gs = new GraphicsSettings();

        this.gravity = [0, 1000];
        this.influenceRadius = 40; // h
        this.restDensity = 5; // p0
        const n = 100;
        this.stiffness = .5 * n; // k
        this.nearStiffness = 0.5 * n; // kN

        this.maxDistancePerFrame = Number.MAX_VALUE;

        this.mousePos = [0, 0];
        this.mousePosPrev = [0, 0];
        this.mouseRadius = 80;
        this.mousePressed = false;
        this.hashGrid = new HashGrid(numParticles, this.influenceRadius);

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        for (let i = 0; i < numParticles; i++) {
            this.particles.push(new Particle(Math.random() * canvas.width, Math.random() * canvas.height, 0, 0));
        }
    }

    applyViscosity() {
    }

    adjustSprings() {
    }

    applySpringDisplacement() {
    }

    doubleDensityRelaxation(dt) {
        for (let i = 0, n = this.particles.length; i < n; i++) {
            const particle = this.particles[i];

            if (this.mousePressed && particle.selected) {
                continue;
            }

            let density = 0; // phi
            let densityNear = 0; // phiN

            let neighbours = [];

            this.hashGrid.queryWithoutIterator(particle.position, this.influenceRadius * 1.2)

            for (let potNeighbourId = 0, max = this.hashGrid.queryCount; potNeighbourId < max; potNeighbourId++) {
                let otherParticle = this.particles[this.hashGrid.queryResultArray[potNeighbourId]];

                const dx = otherParticle.position[0] - particle.position[0];
                const dy = otherParticle.position[1] - particle.position[1];
                const r = Math.sqrt(dx * dx + dy * dy);

                let q = r / this.influenceRadius;

                if (q < 1) {
                    neighbours.push(otherParticle);

                    q = 1 - q;
                    density += q * q
                    densityNear += q * q * q;
                }
            }

            /* this.particles.forEach(otherParticle => {
                const dx = otherParticle.position[0] - particle.position[0];
                const dy = otherParticle.position[1] - particle.position[1];
                const r = Math.sqrt(dx * dx + dy * dy);

                let q = r / this.influenceRadius;

                if (q < 1) {
                    neighbours.push(otherParticle);

                    q = 1 - q;
                    density += q * q
                    densityNear += q * q * q;
                }
            }) */

            const pressure = this.stiffness * (density - this.restDensity);
            const pressureNear = this.nearStiffness * densityNear;

            let deltaPosition = [0, 0];

            for (let j = 0, neighboursLenght = neighbours.length; j < neighboursLenght; j++) {
                const neighbour = neighbours[j];

                const dx = neighbour.position[0] - particle.position[0];
                const dy = neighbour.position[1] - particle.position[1];
                const r = Math.sqrt(dx * dx + dy * dy);

                const q = r / this.influenceRadius;

                let unitvector = [neighbour.position[0] - particle.position[0], neighbour.position[1] - particle.position[1]];
                const norm = (Math.sqrt(unitvector[0] * unitvector[0] + unitvector[1] * unitvector[1]));
                if (norm == 0) {
                    unitvector = [0, 0];
                }
                else {
                    unitvector = [unitvector[0] / norm, unitvector[1] / norm];
                };

                const displacement = dt * (pressure * (1 - q) + pressureNear * (1 - q) * (1 - q)); // normally with second * dt

                neighbour.position[0] += (displacement * unitvector[0]) / 2;
                neighbour.position[1] += (displacement * unitvector[1]) / 2;

                deltaPosition[0] -= (displacement * unitvector[0]) / 2;
                deltaPosition[1] -= (displacement * unitvector[1]) / 2;
            }

            particle.position[0] += deltaPosition[0];
            particle.position[1] += deltaPosition[1];
        }
    }

    resolveCollisions() {
        for (let i = 0, n = this.particles.length; i < n; i++) {
            const particle = this.particles[i];

            if (particle.position[0] < 0) {
                particle.position[0] = 0;
            }

            if (particle.position[0] > canvas.width) {
                particle.position[0] = canvas.width;
            }

            if (particle.position[1] < 0) {
                particle.position[1] = 0;
            }

            if (particle.position[1] > canvas.height) {
                particle.position[1] = canvas.height;
            }
        }
    }

    update(dt) {
        this.hashGrid.update(this.particles);

        for (let i = 0, n = this.particles.length; i < n; i++) {
            this.particles[i].selected = 0;
        }

        for (const i of this.hashGrid.query(this.mousePos, this.mouseRadius)) {
            const other = this.particles[i];

            const dx = other.position[0] - this.mousePos[0];
            const dy = other.position[1] - this.mousePos[1];

            if (Math.sqrt(dx * dx + dy * dy) < this.mouseRadius) {
                other.selected = 1;
            }
        }

        // apply gravity
        for (let i = 0, n = this.particles.length; i < n; i++) {
            const particle = this.particles[i];

            if (this.mousePressed && particle.selected) {
                continue;
            }
            particle.velocity[0] += dt * this.gravity[0];
            particle.velocity[1] += dt * this.gravity[1];
        }

        // modify velocities with pairwise viscosity impulses
        this.applyViscosity();

        for (let i = 0, n = this.particles.length; i < n; i++) {
            const particle = this.particles[i];

            particle.positionPrevious = [...particle.position];

            if (this.mousePressed && particle.selected) {
                continue;
            }

            particle.position[0] += dt * particle.velocity[0];
            particle.position[1] += dt * particle.velocity[1];
        }

        // add and remove springs, change rest lengths
        this.adjustSprings();

        // modify positions according to springs
        // double density relaxation and collisions
        this.applySpringDisplacement();
        this.doubleDensityRelaxation(dt);
        this.resolveCollisions();

        const mouseDelta = [this.mousePos[0] - this.mousePosPrev[0], this.mousePos[1] - this.mousePosPrev[1]]
        this.mousePosPrev = [...this.mousePos];


        // calculate velocities
        for (let i = 0, n = this.particles.length; i < n; i++) {
            const particle = this.particles[i];

            if (this.mousePressed) {
                if (particle.selected) {
                    particle.position[0] += mouseDelta[0];
                    particle.position[1] += mouseDelta[1];
                }
            }

            /* const dx = particle.position[0] - particle.positionPrevious[0];
            const dy = particle.position[1] - particle.positionPrevious[1];

            if (!particle.selected && Math.sqrt(dx * dx + dy * dy) > this.maxDistancePerFrame) {                
                let dir = [particle.position[0] - particle.positionPrevious[0], particle.position[1] - particle.positionPrevious[1]];
                const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
                dir[0] /= len;
                dir[1] /= len;

                particle.position = [particle.positionPrevious[0] + this.maxDistancePerFrame * dir[0], particle.positionPrevious[1] + this.maxDistancePerFrame * dir[1]];
                // particle.position = [...particle.positionPrevious];
            } */


            particle.velocity[0] = (particle.position[0] - particle.positionPrevious[0]) / dt;
            particle.velocity[1] = (particle.position[1] - particle.positionPrevious[1]) / dt;
        }
    }

    draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = this.gs.getLineColour();
        ctx.lineWidth = this.gs.getLineWidth();

        for (let i = 0, n = this.particles.length; i < n; i++) {
            const particle = this.particles[i];

            ctx.fillStyle = this.gs.getParticleColour(particle);

            ctx.beginPath();
            ctx.arc(particle.position[0], particle.position[1], this.gs.getParticleRadius(), 0, Math.PI * 2, true); // Outer circle
            ctx.stroke();
            ctx.fill();
        }
    }
}
