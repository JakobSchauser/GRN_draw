// State management
let activeVariables = [];
let arrows = [];
let isDrawingArrow = false;
let selectedVariable = null;
let selectedArrow = null;
let startVariable = null;
let arrowType = null; // 'promote' or 'inhibit'
let equations = new Map(); // Map to store equations for each variable
let globalCoefficientCounter = 0; // Global counter for unique coefficients
let globalKMCounter = 0; // Global counter for Michaelis-Menten constants
let mathJaxReady = false;
let isDeleteMode = false;
let hoveredForDeletion = null; // Can be either a variable or an arrow

// Track last mouse position and hovered objects
let lastMouseX = 0;
let lastMouseY = 0;
let hoveredForRightClick = null; // Can be either a variable or an arrow

// Class to represent equation terms
class Term {
    constructor(sourceVar, targetVar, type, dependentVar = null, isMichaelisMenten = false, km = null, isConstant = false) {
        this.sourceVar = sourceVar; // The variable that's causing the effect
        this.targetVar = targetVar; // The variable being affected
        this.dependentVar = dependentVar; // The dependent variable for Michaelis-Menten
        this.type = type; // 'promote' or 'inhibit'
        this.isMichaelisMenten = isMichaelisMenten;
        this.km = km;
        this.isConstant = isConstant; // New property to indicate if this term is a constant
    }

    toString(isFirstTerm = false) {
        if (this.isMichaelisMenten) {
            const termString = this.type === 'promote' ? 
                `\\frac{${this.dependentVar.text} ${this.sourceVar.text}}{k_{${this.km}} + ${this.dependentVar.text}}` :
                `-\\frac{${this.dependentVar.text} ${this.sourceVar.text}}{k_{${this.km}} + ${this.dependentVar.text}}`;
            
            return isFirstTerm ? termString : `+${termString}`;
        } else if (this.isConstant) {
            const coefficient = getNextCoefficient();
            return this.type === 'promote' ? 
                (isFirstTerm ? '' : '+') + `c_{${coefficient}}` : 
                `-c_{${coefficient}}`;
        } else {
            const coefficient = getNextCoefficient();
            const termString = this.type === 'promote' ? 
                (isFirstTerm ? '' : '+') + `c_{${coefficient}} ${this.sourceVar.text}` : 
                `-c_{${coefficient}} ${this.sourceVar.text}`;
            
            return termString;
        }
    }
}

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
    // Reset the counters whenever we update the equations list
    globalCoefficientCounter = 0; // Reset coefficient counter
    globalKMCounter = 0; // Reset KM counter

    const equationsList = document.getElementById('equationsList');
    equationsList.innerHTML = Array.from(equations.entries()).map(([variable, terms], index) => `
        <div class="equation-item">
            <div class="equation-content">$$\\frac{d${variable}}{dt}=${terms.map((term, i) => term.toString(i === 0)).join(' ')}$$</div>
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
    
    // Get the target variable for the equation - either the endVar itself or the end variable of the arrow
    const targetVar = endVar instanceof Arrow ? endVar.endVariable : endVar;
    
    // Initialize terms array if it doesn't exist
    if (!equations.has(targetVar.text)) {
        equations.set(targetVar.text, []);
    }
    
    let newterms = equations.get(targetVar.text);
    
    if (endVar instanceof Arrow) {
        // For arrow-to-arrow connections, use Michaelis-Menten form
        const km = getNextKM();
        
        console.log('newterms:', newterms);
        console.log('startVar:', startVar);
        console.log('endVar:', endVar); 

        // Remove any existing direct connection term for the same source variable

        let existing_terms = newterms.filter(term => term.sourceVar === endVar.startVariable);

        
        newterms = newterms.filter(term => term.sourceVar !== endVar.startVariable);

        let type_of_existing = existing_terms[0].type;

        // Create a new Term for the Michaelis-Menten connection
        newterms.push(new Term(endVar.startVariable, targetVar, type_of_existing, startVar, true, km));
    } else {
        // For regular variable connections
        newterms.push(new Term(startVar, targetVar, type));
    }

    equations.set(targetVar.text, newterms);
    
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
        
        // Initialize empty terms array for this variable
        equations.set(text, []);
        updateEquationsList();
    }

    draw(ctx) {
        // Draw circle
        ctx.beginPath();
        ctx.arc(this.x + this.radius, this.y + this.radius, this.radius, 0, Math.PI * 2);
        
        // Use the fill style that was set before calling draw
        ctx.fill();
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x + this.radius, this.y + this.radius);

        // Draw constant source/degradation indicators
        if (equations.has(this.text)) {
            const terms = equations.get(this.text);
            const hasConstantSource = terms.some(term => term.isConstant && term.type === 'promote');
            const hasConstantDegradation = terms.some(term => term.isConstant && term.type === 'inhibit');

            // Draw constant source indicator (green plus)
            if (hasConstantSource) {
                ctx.fillStyle = '#4CAF50'; // Green color
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', this.x + this.radius, this.y + this.radius - 25);
            }

            // Draw constant degradation indicator (red minus)
            if (hasConstantDegradation) {
                ctx.fillStyle = '#f44336'; // Red color
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('−', this.x + this.radius, this.y + this.radius + 25);
            }
        }
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
        this.isDotted = false; // Add property for dotted line
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
        
        // Set line style based on isDotted property
        if (this.isDotted) {
            ctx.setLineDash([5, 5]); // 5px dash, 5px gap
        } else {
            ctx.setLineDash([]); // Solid line
        }
        
        if (this.isSelfConnecting) {
            // For self-connecting arrows, draw a lasso shape
            const radius = this.startVariable.radius * 1.5;
            const controlPointDistance = this.startVariable.radius * 2.5;
            
            let baseAngle = (this.type === 'promote') ? 0. : Math.PI;
            let startAngle = baseAngle - Math.PI / 6;
            let endAngle = baseAngle + Math.PI / 6;

            // Start point (right side of box)
            const startPoint = {
                x: startCenterX + this.startVariable.radius * Math.cos(startAngle),
                y: startCenterY + this.startVariable.radius * Math.sin(startAngle)
            };
            
            // End point (right side of box, slightly below start)
            const endPoint = {
                x: startCenterX + this.startVariable.radius * 1.2 * Math.cos(endAngle),
                y: startCenterY + this.startVariable.radius * 1.2 * Math.sin(endAngle)
            };
            
            // Control points for the curve
            const controlPoint1 = {
                x: startCenterX + this.startVariable.radius * 4. * Math.cos(startAngle),
                y: startCenterY + this.startVariable.radius * 4. * Math.sin(startAngle)
            };
            
            const controlPoint2 = {
                x: startCenterX + this.startVariable.radius * 4. * Math.cos(endAngle),
                y: startCenterY + this.startVariable.radius * 4. * Math.sin(endAngle)
            };
            
            // Draw the curve
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.bezierCurveTo(
                controlPoint1.x, controlPoint1.y,
                controlPoint2.x, controlPoint2.y,
                endPoint.x, endPoint.y
            );
            ctx.stroke();

            // Reset line style before drawing arrow head or T-bar
            ctx.setLineDash([]);

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
                ctx.fill();
            } else if (this.type === 'inhibit') {
                // Draw T-bar
                const barLength = 18;
                const barAngle = Math.PI / 1.5;
                const barX1 = endPoint.x - (barLength/2) * Math.cos(barAngle);
                const barY1 = endPoint.y - (barLength/2) * Math.sin(barAngle);
                const barX2 = endPoint.x + (barLength/2) * Math.cos(barAngle);
                const barY2 = endPoint.y + (barLength/2) * Math.sin(barAngle);
                
                ctx.beginPath();
                ctx.moveTo(barX1, barY1);
                ctx.lineTo(barX2, barY2);
                ctx.stroke();
            }
        } else {
            let endPoint;
            let angle;

            if (this.isArrowToArrow) {
                endPoint = this.endVariable.getMidpoint();
                angle = Math.atan2(endPoint.y - startCenterY, endPoint.x - startCenterX);
                endPoint.x -= Math.cos(angle) * 10;
                endPoint.y -= Math.sin(angle) * 10;
            } else {
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
            ctx.stroke();

            // Reset line style before drawing arrow head or T-bar
            ctx.setLineDash([]);

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
            setDeleteMode(false);
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
            setDeleteMode(false);
            setArrowMode(isDrawingArrow && arrowType === 'promote' ? null : 'promote');
        });
        document.getElementById('drawInhibitArrow').addEventListener('click', () => {
            setDeleteMode(false);
            setArrowMode(isDrawingArrow && arrowType === 'inhibit' ? null : 'inhibit');
        });

        function setDeleteMode(enabled) {
            isDeleteMode = enabled;
            isDrawingArrow = false;
            arrowType = null;
            // UI feedback
            const deleteButton = document.getElementById('deleteButton');
            if (enabled) {
                deleteButton.classList.add('active');
            } else {
                deleteButton.classList.remove('active');
            }
            
            // Update cursor
            canvas.style.cursor = enabled ? 'crosshair' : 'default';
        }

        // Add delete button event listener
        document.getElementById('deleteButton').addEventListener('click', () => {
            setDeleteMode(!isDeleteMode);
        });

        document.getElementById('clearAll').addEventListener('click', () => {
            setDeleteMode(false);
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
        function connectionExists(startVar, endVar, type) {
            return arrows.some(arrow => 
                arrow.startVariable === startVar && 
                arrow.endVariable === endVar && 
                arrow.type === type // Check if the type is the same
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

        // Update mousemove to track position and handle hover effects
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
            
            // Update hoveredForRightClick
            hoveredForRightClick = hoveredVariable || hoveredArrow;
            
            if (isDeleteMode) {
                hoveredForDeletion = hoveredForRightClick;
                if (hoveredForDeletion) {
                    canvas.style.cursor = 'crosshair';
                } else {
                    canvas.style.cursor = 'default';
                }
            } else {
                hoveredForDeletion = null;
                if (hoveredVariable) {
                    hoveredVariable.isHovered = true;
                    
                    if (isDrawingArrow && startVariable) {
                        if (connectionExists(startVariable, hoveredVariable, arrowType)) {
                            canvas.style.cursor = 'not-allowed';
                        } else {
                            canvas.style.cursor = 'crosshair';
                        }
                    } else if (!isDrawingArrow) {
                        canvas.style.cursor = 'move';
                    }
                } else if (hoveredArrow && isDrawingArrow && startVariable) {
                    if (connectionExists(startVariable, hoveredArrow, arrowType)) {
                        canvas.style.cursor = 'not-allowed';
                    } else {
                        canvas.style.cursor = 'crosshair';
                    }
                } else {
                    if (isDrawingArrow) {
                        canvas.style.cursor = 'crosshair';
                    } else if (hoveredForRightClick) {
                        canvas.style.cursor = 'context-menu';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                }
            }

            // Handle dragging
            if (selectedVariable && selectedVariable.isDragging) {
                selectedVariable.x = x - selectedVariable.dragOffsetX;
                selectedVariable.y = y - selectedVariable.dragOffsetY;
                redraw();
            } else {
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

            if (isDeleteMode && hoveredForDeletion) {
                if (hoveredForDeletion instanceof ActiveVariable) {
                    // Delete all arrows connected to this variable
                    arrows = arrows.filter(arrow => {
                        const isConnected = arrow.startVariable === hoveredForDeletion || 
                                          arrow.endVariable === hoveredForDeletion ||
                                          (arrow.endVariable instanceof Arrow && 
                                           arrow.endVariable.endVariable === hoveredForDeletion);
                        if (isConnected) {
                            // Remove terms from equations
                            const targetVar = arrow.endVariable instanceof Arrow ? 
                                arrow.endVariable.endVariable : arrow.endVariable;
                            if (equations.has(targetVar.text)) {
                                const terms = equations.get(targetVar.text);
                                equations.set(targetVar.text, terms.filter(term => 
                                    term.sourceVar !== hoveredForDeletion
                                ));
                            }
                        }
                        return !isConnected;
                    });
                    // Delete the variable
                    activeVariables = activeVariables.filter(v => v !== hoveredForDeletion);
                    // Delete its equation
                    equations.delete(hoveredForDeletion.text);
                    updateEquationsList();
                } else if (hoveredForDeletion instanceof Arrow) {
                    // Delete the arrow
                    arrows = arrows.filter(arrow => arrow !== hoveredForDeletion);

                    arrows = arrows.filter(arrow => {
                        return arrow.endVariable !== hoveredForDeletion;
                    });

                    // Update equations
                    const targetVar = hoveredForDeletion.endVariable instanceof Arrow ? 
                        hoveredForDeletion.endVariable.endVariable : hoveredForDeletion.endVariable;
                    if (equations.has(targetVar.text)) {
                        const terms = equations.get(targetVar.text);
                        equations.set(targetVar.text, terms.filter(term => 
                            term.sourceVar !== hoveredForDeletion.startVariable
                        ));
                    }
                    updateEquationsList();
                }
                hoveredForDeletion = null;
                redraw();
                return;
            }

            if (isDrawingArrow && startVariable) {
                const endVariable = activeVariables.find(variable => variable.isPointInside(x, y));
                const endArrow = !endVariable ? findArrowUnderPoint(x, y) : null;
                const target = endVariable || endArrow;

                console.log('Mouseup:', { endVariable, endArrow, target });

                if (target && !connectionExists(startVariable, target, arrowType) && 
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
            arrows.forEach(arrow => {
                if (isDeleteMode && arrow === hoveredForDeletion) {
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 4;
                } else if (arrow === hoveredForRightClick) {
                    ctx.strokeStyle = '#2196F3'; // Blue highlight for hover
                    ctx.lineWidth = 3;
                } else {
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                }
                arrow.draw(ctx);
            });
            
            // Draw active variables
            activeVariables.forEach(variable => {
                if (isDeleteMode && variable === hoveredForDeletion) {
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 4;
                    ctx.fillStyle = '#ffcccc'; // Light red fill for hovered variables
                } else if (variable === hoveredForRightClick) {
                    ctx.strokeStyle = '#2196F3'; // Blue highlight for hover
                    ctx.lineWidth = 3;
                    ctx.fillStyle = '#e3f2fd'; // Light blue fill for hover
                } else {
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.fillStyle = variable.isHovered ? '#e0e0e0' : '#ffffff';
                }
                variable.draw(ctx);
            });

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
                        if (!connectionExists(startVariable, variable, arrowType)) {
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
                        if (!connectionExists(startVariable, arrow, arrowType) && !sharesStartNode(startVariable, arrow)) {
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

        document.addEventListener('DOMContentLoaded', () => {
            // Get the context menu elements
            const contextMenu = document.getElementById('contextMenu');
            const arrowContextMenu = document.getElementById('arrowContextMenu');
            const addConstantSourceButton = document.getElementById('addConstantSource');
            const addConstantDegradationButton = document.getElementById('addConstantDegradation');
            const toggleDottedButton = document.getElementById('toggleDotted');

            // Hide the context menus initially
            contextMenu.style.display = 'none';
            arrowContextMenu.style.display = 'none';

            // Add right-click event listener to the canvas
            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault(); // Prevent the default context menu from appearing

                const rect = canvas.getBoundingClientRect();
                const x = e.clientX; // Global X position
                const y = e.clientY; // Global Y position
                const canvasX = x - rect.left;
                const canvasY = y - rect.top;

                // Check if the right-click is on a node or arrow
                const clickedVariable = activeVariables.find(variable => variable.isPointInside(canvasX, canvasY));
                const clickedArrow = !clickedVariable ? findArrowUnderPoint(canvasX, canvasY) : null;

                if (clickedVariable) {
                    // Show variable context menu
                    contextMenu.style.left = `${x-100}px`;
                    contextMenu.style.top = `${y-60}px`;
                    contextMenu.style.display = 'block';
                    arrowContextMenu.style.display = 'none';
                    selectedVariable = clickedVariable;

                    // Reset button states based on the selected variable
                    if (hasConstantTerm(selectedVariable, 'promote')) {
                        addConstantSourceButton.textContent = 'Remove Constant Source';
                        addConstantSourceButton.style.backgroundColor = '#ff9800';
                    } else {
                        addConstantSourceButton.textContent = 'Add Constant Source';
                        addConstantSourceButton.style.backgroundColor = '';
                    }

                    if (hasConstantTerm(selectedVariable, 'inhibit')) {
                        addConstantDegradationButton.textContent = 'Remove Constant Degradation';
                        addConstantDegradationButton.style.backgroundColor = '#ff9800';
                    } else {
                        addConstantDegradationButton.textContent = 'Add Constant Degradation';
                        addConstantDegradationButton.style.backgroundColor = '';
                    }
                } else if (clickedArrow) {
                    // Show arrow context menu
                    arrowContextMenu.style.left = `${x-100}px`;
                    arrowContextMenu.style.top = `${y-60}px`;
                    arrowContextMenu.style.display = 'block';
                    contextMenu.style.display = 'none';
                    
                    // Update button text based on current state
                    toggleDottedButton.textContent = clickedArrow.isDotted ? 'Make Solid' : 'Make Dotted';
                    toggleDottedButton.style.backgroundColor = clickedArrow.isDotted ? '#ff9800' : '';
                    
                    // Store the clicked arrow for later use
                    selectedArrow = clickedArrow;
                } else {
                    // Hide both context menus if not clicking on a node or arrow
                    contextMenu.style.display = 'none';
                    arrowContextMenu.style.display = 'none';
                }
            });

            // Hide the context menu when clicking elsewhere
            window.addEventListener('click', () => {
                contextMenu.style.display = 'none';
                // Reset button states when context menu is hidden
                addConstantSourceButton.textContent = 'Add Constant Source';
                addConstantSourceButton.style.backgroundColor = '';
                addConstantDegradationButton.textContent = 'Add Constant Degradation';
                addConstantDegradationButton.style.backgroundColor = '';
            });

            // Add event listener for adding/removing constant source
            addConstantSourceButton.addEventListener('click', () => {
                if (selectedVariable) {
                    console.log(`Adding constant source to ${selectedVariable.text}`);
                    
                    // Check if the constant source already exists
                    if (hasConstantTerm(selectedVariable, 'promote')) {
                        console.log('Constant source already exists for this variable.');
                        // Change button text and color to indicate removal
                        addConstantSourceButton.textContent = 'Remove Constant Source';
                        addConstantSourceButton.style.backgroundColor = '#ff9800'; // Change to a different color
                        
                        // Remove the existing constant source term
                        const terms = equations.get(selectedVariable.text);
                        const termIndex = terms.findIndex(term => term.isConstant && term.type === 'promote');
                        if (termIndex !== -1) {
                            terms.splice(termIndex, 1); // Remove the term
                            equations.set(selectedVariable.text, terms); // Update the equations map
                            updateEquationsList(); // Update the displayed equations
                        }
                    } else {
                        // If it doesn't exist, add the constant source
                        if (!equations.has(selectedVariable.text)) {
                            equations.set(selectedVariable.text, []);
                        }
                        
                        const terms = equations.get(selectedVariable.text);
                        
                        // Add the +c term
                        const constantSourceTerm = new Term(null, selectedVariable, 'promote', null, false, null, true); // Mark as constant
                        terms.push(constantSourceTerm);
                        
                        // Update the equations map
                        equations.set(selectedVariable.text, terms);
                        
                        // Update the equations list to reflect the changes
                        updateEquationsList();
                        
                        // Change button text and color to indicate it has been added
                        addConstantSourceButton.textContent = 'Remove Constant Source';
                        addConstantSourceButton.style.backgroundColor = '#ff9800'; // Change to a different color
                    }
                }
                contextMenu.style.display = 'none'; // Hide the context menu after action
            });

            // Add event listener for adding constant degradation
            addConstantDegradationButton.addEventListener('click', () => {
                const addConstantDegradationButton = document.getElementById('addConstantDegradation');

                if (selectedVariable) {
                    console.log(`Adding constant degradation to ${selectedVariable.text}`);
                    
                    // Check if the constant degradation already exists
                    if (hasConstantTerm(selectedVariable, 'inhibit')) {
                        console.log('Constant degradation already exists for this variable.');
                        // Change button text and color to indicate removal
                        addConstantDegradationButton.textContent = 'Remove Constant Degradation';
                        addConstantDegradationButton.style.backgroundColor = '#ff9800'; // Change to a different color
                        
                        // Remove the existing constant degradation term
                        const terms = equations.get(selectedVariable.text);
                        const termIndex = terms.findIndex(term => term.isConstant && term.type === 'inhibit');
                        if (termIndex !== -1) {
                            terms.splice(termIndex, 1); // Remove the term
                            equations.set(selectedVariable.text, terms); // Update the equations map
                            updateEquationsList(); // Update the displayed equations
                        }
                    } else {
                        // If it doesn't exist, add the constant degradation
                        if (!equations.has(selectedVariable.text)) {
                            equations.set(selectedVariable.text, []);
                        }
                        
                        const terms = equations.get(selectedVariable.text);
                        
                        // Add the -c term for degradation
                        const constantDegradationTerm = new Term(null, selectedVariable, 'inhibit', null, false, null, true); // Mark as constant
                        terms.push(constantDegradationTerm);
                        
                        // Update the equations map
                        equations.set(selectedVariable.text, terms);
                        
                        // Update the equations list to reflect the changes
                        updateEquationsList();
                        
                        // Change button text and color to indicate it has been added
                        addConstantDegradationButton.textContent = 'Remove Constant Degradation';
                        addConstantDegradationButton.style.backgroundColor = '#ff9800'; // Change to a different color
                    }
                }
                contextMenu.style.display = 'none'; // Hide the context menu after action
            });

            // Add event listener for toggling dotted line
            toggleDottedButton.addEventListener('click', () => {
                if (selectedArrow) {
                    selectedArrow.isDotted = !selectedArrow.isDotted;
                    toggleDottedButton.textContent = selectedArrow.isDotted ? 'Make Solid' : 'Make Dotted';
                    toggleDottedButton.style.backgroundColor = selectedArrow.isDotted ? '#ff9800' : '';
                    redraw();
                }
                arrowContextMenu.style.display = 'none';
            });
        });

        function hasConstantTerm(variable, type) {
            if (equations.has(variable.text)) {
                const terms = equations.get(variable.text);
                return terms.some(term => term.isConstant && term.type === type);
            }
            return false;
        }
    }
} 