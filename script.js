// State management
let activeVariables = [];
let arrows = [];
let isDrawingArrow = false;
let selectedVariable = null;
let startVariable = null;
let arrowType = null; // 'promote' or 'inhibit'
let equations = new Map(); // Map to store equations for each variable
let globalCoefficientCounter = 0; // Global counter for unique coefficients
let globalKMCounter = 0; // Global counter for Michaelis-Menten constants
let mathJaxReady = false;

// Wait for MathJax to be ready
window.addEventListener('load', () => {
    if (window.MathJax) {
        mathJaxReady = true;
        updateEquationsList();
    }
});

// Helper function to get next coefficient
function getNextCoefficient() {
    globalCoefficientCounter++;
    return globalCoefficientCounter;
}

// Helper function to get next KM constant
function getNextKM() {
    globalKMCounter++;
    return globalKMCounter;
}

function updateEquationsList() {
    const equationsList = document.getElementById('equationsList');
    equationsList.innerHTML = Array.from(equations.entries()).map(([variable, equation], index) => `
        <div class="equation-item">
            <div class="equation-content">$$${equation}$$</div>
            <button onclick="deleteEquation('${variable}')" class="delete-equation">×</button>
        </div>
    `).join('');
    
    // Only try to render if MathJax is ready
    if (mathJaxReady && window.MathJax) {
        try {
            MathJax.typeset([equationsList]);
        } catch (e) {
            console.log('MathJax rendering failed:', e);
        }
    }
}

function deleteEquation(variable) {
    equations.delete(variable);
    updateEquationsList();
}

// Helper function to update equation with new term
function updateEquationWithArrow(startVar, endVar, type) {
    console.log('Updating equation:', { startVar, endVar, type });
    console.log('endVar instanceof Arrow:', endVar instanceof Arrow);
    
    // Get the target variable - either the endVar itself or the end variable of the arrow
    const targetVar = endVar instanceof Arrow ? endVar.endVariable : endVar;
    const currentEquation = equations.get(targetVar.text);
    console.log('Current equation:', currentEquation);
    
    const coefficient = getNextCoefficient();
    let term;
    
    if (endVar instanceof Arrow) {
        // For arrow-to-arrow connections, use Michaelis-Menten form
        const km = getNextKM();
        term = type === 'promote' ? 
            `+\\frac{${endVar.startVariable.text} ${startVar.text}}{k_{${km}} + ${startVar.text}}` :
            `-\\frac{${endVar.startVariable.text} ${startVar.text}}{k_{${km}} + ${startVar.text}}`;
        console.log('Created Michaelis-Menten term:', term);
    } else {
        // For regular variable connections
        term = type === 'promote' ? 
            `+c_{${coefficient}} ${startVar.text}` : 
            `-c_{${coefficient}} ${startVar.text}`;
        console.log('Created regular term:', term);
    }
    
    // If equation ends with '=', add a space and remove leading + if it's the first term
    let newEquation;
    if (currentEquation.endsWith('=')) {
        newEquation = currentEquation + ' ' + (type === 'promote' ? term.substring(1) : term);
    } else {
        newEquation = currentEquation + ' ' + term;
    }
    
    console.log('New equation:', newEquation);
    equations.set(targetVar.text, newEquation);
    updateEquationsList();
}

class ActiveVariable {
    constructor(x, y, text = '') {
        this.x = x;
        this.y = y;
        this.radius = 40; // Reduced from 50 to 40
        this.text = text;
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.isHovered = false;
        
        // Create initial equation for this variable
        equations.set(text, `\\frac{d${text}}{dt}=`);
        updateEquationsList();
    }

    draw(ctx) {
        // Draw circle
        ctx.beginPath();
        ctx.arc(this.x + this.radius, this.y + this.radius, this.radius, 0, Math.PI * 2);
        
        // Set fill color based on hover state
        if (this.isHovered) {
            ctx.fillStyle = '#e0e0e0'; // Light grey when hovered
        } else {
            ctx.fillStyle = '#ffffff';
        }
        
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x + this.radius, this.y + this.radius);
    }

    isPointInside(x, y) {
        const centerX = this.x + this.radius;
        const centerY = this.y + this.radius;
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        return distance <= this.radius;
    }

    getIntersectionPoint(angle) {
        const centerX = this.x + this.radius;
        const centerY = this.y + this.radius;
        // Move intersection point slightly inward (0.9 of radius)
        return {
            x: centerX + this.radius * 1.1 * Math.cos(angle),
            y: centerY + this.radius * 1.1 * Math.sin(angle)
        };
    }

    overlaps(otherVariable) {
        const centerX1 = this.x + this.radius;
        const centerY1 = this.y + this.radius;
        const centerX2 = otherVariable.x + otherVariable.radius;
        const centerY2 = otherVariable.y + otherVariable.radius;
        
        const distance = Math.sqrt(
            Math.pow(centerX2 - centerX1, 2) + 
            Math.pow(centerY2 - centerY1, 2)
        );
        
        // Consider variables overlapping if their centers are closer than 2.2 times the radius
        return distance < this.radius * 2.2;
    }
}

class Arrow {
    constructor(startVariable, endVariable, type = 'promote') {
        this.startVariable = startVariable;
        this.endVariable = endVariable;
        this.type = type;
        this.isSelfConnecting = startVariable === endVariable;
        this.isArrowToArrow = endVariable instanceof Arrow;
    }

    getMidpoint() {
        if (this.isSelfConnecting) {
            const startCenterX = this.startVariable.x + this.startVariable.radius;
            const startCenterY = this.startVariable.y + this.startVariable.radius;
            const radius = this.startVariable.radius * 1.5;
            const controlPointDistance = this.startVariable.radius * 2.5;
            
            // Calculate midpoint of the self-connecting curve
            return {
                x: startCenterX + controlPointDistance,
                y: startCenterY
            };
        } else {
            const startCenterX = this.startVariable.x + this.startVariable.radius;
            const startCenterY = this.startVariable.y + this.startVariable.radius;
            const endCenterX = this.endVariable.x + this.endVariable.radius;
            const endCenterY = this.endVariable.y + this.endVariable.radius;
            
            // Calculate midpoint of the straight line
            return {
                x: (startCenterX + endCenterX) / 2,
                y: (startCenterY + endCenterY) / 2
            };
        }
    }

    draw(ctx) {
        const startCenterX = this.startVariable.x + this.startVariable.radius;
        const startCenterY = this.startVariable.y + this.startVariable.radius;
        
        if (this.isSelfConnecting) {
            // For self-connecting arrows, draw a lasso shape
            const radius = this.startVariable.radius * 1.5;
            const controlPointDistance = this.startVariable.radius * 2.5;
            
            // Start point (right side of box)
            const startPoint = {
                x: startCenterX + this.startVariable.radius,
                y: startCenterY
            };
            
            // End point (right side of box, slightly below start)
            const endPoint = {
                x: startCenterX + this.startVariable.radius,
                y: startCenterY + 10
            };
            
            // Control points for the curve
            const controlPoint1 = {
                x: startCenterX + controlPointDistance,
                y: startCenterY - controlPointDistance
            };
            const controlPoint2 = {
                x: startCenterX + controlPointDistance,
                y: startCenterY + controlPointDistance
            };
            
            // Draw the curve
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.bezierCurveTo(
                controlPoint1.x, controlPoint1.y,
                controlPoint2.x, controlPoint2.y,
                endPoint.x, endPoint.y
            );
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();

            if (this.type === 'promote') {
                // Draw arrow head
                const arrowLength = 15;
                const arrowAngle = Math.PI / 6;
                const tangentAngle = 2*Math.PI *7/12;
                
                ctx.beginPath();
                ctx.moveTo(endPoint.x, endPoint.y);
                ctx.lineTo(
                    endPoint.x - arrowLength * Math.cos(tangentAngle - arrowAngle),
                    endPoint.y - arrowLength * Math.sin(tangentAngle - arrowAngle)
                );
                ctx.lineTo(
                    endPoint.x - arrowLength * Math.cos(tangentAngle + arrowAngle),
                    endPoint.y - arrowLength * Math.sin(tangentAngle + arrowAngle)
                );
                ctx.closePath();
                ctx.fillStyle = '#000000';
                ctx.fill();
            } else if (this.type === 'inhibit') {
                // Draw T-bar
                const barLength = 18;
                const barAngle = Math.PI / 2;
                const barX1 = endPoint.x - (barLength/2);
                const barY1 = endPoint.y;
                const barX2 = endPoint.x + (barLength/2);
                const barY2 = endPoint.y;
                
                ctx.beginPath();
                ctx.moveTo(barX1, barY1);
                ctx.lineTo(barX2, barY2);
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        } else {
            let endPoint;
            let angle;

            if (this.isArrowToArrow) {
                // If connecting to another arrow, use its midpoint
                endPoint = this.endVariable.getMidpoint();
                angle = Math.atan2(endPoint.y - startCenterY, endPoint.x - startCenterX);
            } else {
                // Original code for variable-to-variable connection
                const endCenterX = this.endVariable.x + this.endVariable.radius;
                const endCenterY = this.endVariable.y + this.endVariable.radius;
                angle = Math.atan2(endCenterY - startCenterY, endCenterX - startCenterX);
                endPoint = this.endVariable.getIntersectionPoint(angle + Math.PI);
            }

            const startPoint = this.startVariable.getIntersectionPoint(angle);

            // Draw line
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();

            if (this.type === 'promote') {
                // Draw arrow head
                const arrowLength = 15;
                const arrowAngle = Math.PI / 6;
                ctx.beginPath();
                ctx.moveTo(endPoint.x, endPoint.y);
                ctx.lineTo(
                    endPoint.x - arrowLength * Math.cos(angle - arrowAngle),
                    endPoint.y - arrowLength * Math.sin(angle - arrowAngle)
                );
                ctx.lineTo(
                    endPoint.x - arrowLength * Math.cos(angle + arrowAngle),
                    endPoint.y - arrowLength * Math.sin(angle + arrowAngle)
                );
                ctx.closePath();
                ctx.fillStyle = '#000000';
                ctx.fill();
            } else if (this.type === 'inhibit') {
                // Draw flat bar (T-bar)
                const barLength = 18;
                const barAngle = Math.PI / 2;
                const barX1 = endPoint.x - (barLength/2) * Math.cos(angle - barAngle);
                const barY1 = endPoint.y - (barLength/2) * Math.sin(angle - barAngle);
                const barX2 = endPoint.x + (barLength/2) * Math.cos(angle - barAngle);
                const barY2 = endPoint.y + (barLength/2) * Math.sin(angle - barAngle);
                ctx.beginPath();
                ctx.moveTo(barX1, barY1);
                ctx.lineTo(barX2, barY2);
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
    }
}

// Initialize canvas
const canvas = document.getElementById('mainCanvas');
if (!canvas) {
    console.error('Canvas element not found!');
} else {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get canvas context!');
    } else {
        // Set canvas size
        function resizeCanvas() {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            redraw();
        }

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Add initial nodes for debugging
        function addInitialNodes() {
            // Add node A
            const nodeA = new ActiveVariable(100, 100, 'A');
            activeVariables.push(nodeA);
            
            // Add node B
            const nodeB = new ActiveVariable(300, 100, 'B');
            activeVariables.push(nodeB);
            
            // Add node C
            const nodeC = new ActiveVariable(200, 300, 'C');
            activeVariables.push(nodeC);
            
            redraw();
        }

        // Call the function to add initial nodes
        addInitialNodes();

        // Event listeners
        document.getElementById('addTextBox').addEventListener('click', () => {
            const text = prompt('Enter name for the active variable:', 'New Variable');
            if (text !== null) {
                let x = 50;
                let y = 50;
                let attempts = 0;
                const maxAttempts = 10;
                
                // Try to find a non-overlapping position
                while (attempts < maxAttempts) {
                    const newVariable = new ActiveVariable(x, y, text);
                    const hasOverlap = activeVariables.some(existingVariable => newVariable.overlaps(existingVariable));
                    
                    if (!hasOverlap) {
                        activeVariables.push(newVariable);
                        break;
                    }
                    
                    // Move to the right and try again
                    x += 100;
                    attempts++;
                    
                    // If we've gone too far right, move down and reset x
                    if (x > canvas.width - 100) {
                        x = 50;
                        y += 100;
                    }
                }
                
                // If we couldn't find a non-overlapping position, just add it at the last attempted position
                if (attempts === maxAttempts) {
                    activeVariables.push(new ActiveVariable(x, y, text));
                }
                
                redraw();
            }
        });

        function setArrowMode(type) {
            isDrawingArrow = !!type;
            arrowType = type;
            // UI feedback
            document.getElementById('drawPromoteArrow').style.backgroundColor = (type === 'promote') ? '#ff9800' : '#4CAF50';
            document.getElementById('drawInhibitArrow').style.backgroundColor = (type === 'inhibit') ? '#ff9800' : '#4CAF50';
            
            // Update cursor
            if (isDrawingArrow) {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'default';
            }
        }

        document.getElementById('drawPromoteArrow').addEventListener('click', () => {
            setArrowMode(isDrawingArrow && arrowType === 'promote' ? null : 'promote');
        });
        document.getElementById('drawInhibitArrow').addEventListener('click', () => {
            setArrowMode(isDrawingArrow && arrowType === 'inhibit' ? null : 'inhibit');
        });

        document.getElementById('clearAll').addEventListener('click', () => {
            activeVariables = [];
            arrows = [];
            equations.clear();
            globalCoefficientCounter = 0;
            globalKMCounter = 0;
            updateEquationsList();
            redraw();
        });

        // Mouse event handlers
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (isDrawingArrow) {
                startVariable = activeVariables.find(variable => variable.isPointInside(x, y));
                if (startVariable) {
                    canvas.style.cursor = 'crosshair';
                }
            } else {
                selectedVariable = activeVariables.find(variable => variable.isPointInside(x, y));
                if (selectedVariable) {
                    selectedVariable.isDragging = true;
                    selectedVariable.dragOffsetX = x - selectedVariable.x;
                    selectedVariable.dragOffsetY = y - selectedVariable.y;
                    canvas.style.cursor = 'move';
                }
            }
        });

        // Add a helper function to check if a connection already exists
        function connectionExists(startVar, endVar) {
            return arrows.some(arrow => 
                arrow.startVariable === startVar && 
                arrow.endVariable === endVar
            );
        }

        // Add a helper function to check if arrows share the same start node
        function sharesStartNode(startVar, endArrow) {
            return endArrow.startVariable === startVar;
        }

        // Add a helper function to find arrow under point
        function findArrowUnderPoint(x, y) {
            for (let arrow of arrows) {
                const midpoint = arrow.getMidpoint();
                const distance = Math.sqrt(
                    Math.pow(x - midpoint.x, 2) + 
                    Math.pow(y - midpoint.y, 2)
                );
                if (distance < 20) { // Increased radius for easier clicking
                    return arrow;
                }
            }
            return null;
        }

        // Track last mouse position
        let lastMouseX = 0;
        let lastMouseY = 0;

        // Update mousemove to track position
        canvas.addEventListener('mousemove', (e) => {
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Reset hover state for all variables
            activeVariables.forEach(variable => {
                variable.isHovered = false;
            });

            // Find hovered variable or arrow
            const hoveredVariable = activeVariables.find(variable => variable.isPointInside(x, y));
            const hoveredArrow = !hoveredVariable ? findArrowUnderPoint(x, y) : null;
            
            if (hoveredVariable) {
                hoveredVariable.isHovered = true;
                
                if (isDrawingArrow && startVariable) {
                    // If we're drawing an arrow and hovering over a variable
                    if (connectionExists(startVariable, hoveredVariable)) {
                        // Show not-allowed cursor if connection already exists
                        canvas.style.cursor = 'not-allowed';
                    } else {
                        // Show crosshair for valid new connections
                        canvas.style.cursor = 'crosshair';
                    }
                } else if (!isDrawingArrow) {
                    // If we're not drawing an arrow, show move cursor
                    canvas.style.cursor = 'move';
                }
            } else if (hoveredArrow && isDrawingArrow && startVariable) {
                // If hovering over an arrow while drawing
                if (connectionExists(startVariable, hoveredArrow)) {
                    canvas.style.cursor = 'not-allowed';
                } else {
                    canvas.style.cursor = 'crosshair';
                }
            } else {
                // If not hovering over any variable or arrow
                if (isDrawingArrow) {
                    canvas.style.cursor = 'crosshair';
                } else {
                    canvas.style.cursor = 'default';
                }
            }

            // Handle dragging
            if (selectedVariable && selectedVariable.isDragging) {
                selectedVariable.x = x - selectedVariable.dragOffsetX;
                selectedVariable.y = y - selectedVariable.dragOffsetY;
                redraw();
            } else {
                // Only redraw if we're not dragging (to show hover effects)
                redraw();
            }
        });

        // Update mouseout event for canvas
        canvas.addEventListener('mouseout', () => {
            // Reset hover states
            activeVariables.forEach(variable => {
                variable.isHovered = false;
            });
            canvas.style.cursor = 'default';
            redraw();
        });

        // Update the mouseup event handler
        canvas.addEventListener('mouseup', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (isDrawingArrow && startVariable) {
                const endVariable = activeVariables.find(variable => variable.isPointInside(x, y));
                const endArrow = !endVariable ? findArrowUnderPoint(x, y) : null;
                const target = endVariable || endArrow;

                console.log('Mouseup:', { endVariable, endArrow, target });

                if (target && !connectionExists(startVariable, target) && 
                    (!endArrow || !sharesStartNode(startVariable, endArrow))) {
                    arrows.push(new Arrow(startVariable, target, arrowType));
                    // Update the equation for the target variable
                    if (endArrow) {
                        console.log('Updating equation for arrow connection');
                        // For arrow-to-arrow connections, update the equation of the target arrow's end variable
                        updateEquationWithArrow(startVariable, endArrow, arrowType);
                    } else {
                        console.log('Updating equation for variable connection');
                        // For variable-to-variable connections
                        updateEquationWithArrow(startVariable, target, arrowType);
                    }
                    // Automatically deselect arrow mode after drawing
                    setArrowMode(null);
                }
                startVariable = null;
                canvas.style.cursor = 'default';
                redraw();
            }

            if (selectedVariable) {
                selectedVariable.isDragging = false;
                selectedVariable = null;
                canvas.style.cursor = 'default';
            }
        });

        // Drawing function
        function redraw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw arrows
            arrows.forEach(arrow => arrow.draw(ctx));
            
            // Draw active variables
            activeVariables.forEach(variable => variable.draw(ctx));

            // Draw grey overlay and connection points when drawing arrows
            if (isDrawingArrow && startVariable) {
                const hoveredVariable = activeVariables.find(variable => variable.isHovered);
                const hoveredArrow = !hoveredVariable ? findArrowUnderPoint(
                    lastMouseX - canvas.getBoundingClientRect().left,
                    lastMouseY - canvas.getBoundingClientRect().top
                ) : null;

                // Draw all available connection points
                if (!hoveredVariable) {
                    // Draw variable connection points
                    activeVariables.forEach(variable => {
                        if (!connectionExists(startVariable, variable)) {
                            const angle = Math.atan2(
                                variable.y + variable.radius - (startVariable.y + startVariable.radius),
                                variable.x + variable.radius - (startVariable.x + startVariable.radius)
                            );
                            const point = variable.getIntersectionPoint(angle + Math.PI);
                            drawConnectionPoint(point.x, point.y);
                        }
                    });

                    // Draw arrow midpoints
                    arrows.forEach(arrow => {
                        if (!connectionExists(startVariable, arrow) && !sharesStartNode(startVariable, arrow)) {
                            const midpoint = arrow.getMidpoint();
                            drawConnectionPoint(midpoint.x, midpoint.y);
                        }
                    });
                }

                if (!hoveredVariable && !hoveredArrow) {
                    // Draw semi-transparent grey overlay
                    ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }
        }

        // Helper function to draw connection points
        function drawConnectionPoint(x, y) {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#4CAF50';
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Add toggle equations functionality
        document.getElementById('toggleEquations').addEventListener('click', () => {
            const panel = document.getElementById('equationsPanel');
            const button = document.getElementById('toggleEquations');
            panel.classList.toggle('hidden');
            button.textContent = panel.classList.contains('hidden') ? 'Show Equations' : 'Hide Equations';
        });
    }
} 