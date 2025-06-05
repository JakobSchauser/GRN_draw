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
let rightClickedObject = null; // Store the object that was right-clicked

// Add panning state variables
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// Add maps for initial conditions and parameters
let initialConditions = new Map(); // Map to store initial conditions for each variable
let parameters = new Map(); // Map to store parameter values

// Functions to handle parameter updates
function updateInitialCondition(variable, value) {
    initialConditions.set(variable, parseFloat(value));
    console.log('Updated initial condition:', variable, value);
}

function updateParameter(param, value) {
    parameters.set(param, parseFloat(value));
    console.log('Updated parameter:', param, value);
}

// Track last mouse position and hovered objects
let lastMouseX = 0;
let lastMouseY = 0;
let hoveredForRightClick = null; // Can be either a variable or an arrow

// Add at the top of the file, after the state management variables
let andGroupColors = new Map(); // Map to store colors for AND logic groups

// Helper function to get color for AND groups
function getAndGroupColor(groupId) {
    if (!andGroupColors.has(groupId)) {
        // Generate a random pastel color
        const hue = Math.random() * 360;
        andGroupColors.set(groupId, `hsl(${hue}, 70%, 80%)`);
    }
    return andGroupColors.get(groupId);
}

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
        this.logicGroup = null; // Group ID for AND/OR logic
        this.logicType = null; // 'and' or 'or'
        this.coefficientId = null; // Store the coefficient ID
        this.kmId = null; // Store the KM constant ID
    }

    toString(isFirstTerm = false) {
        // If this term is part of a logic group, only the first term in the group should render
        if (this.logicGroup !== null) {
            const terms = Array.from(equations.get(this.targetVar.text))
                .filter(t => t.logicGroup === this.logicGroup);
            
            // Only render if this is the first term in the group
            if (terms[0] !== this) {
                return '';
            }
            
            if (terms.length > 1) {
                const termStringsWithoutCoefficient = terms.map(t => {
                    if (t.isConstant) {
                        return t.type === 'promote' ? 
                            `c_{${t.coefficientId}}` : 
                            `-c_{${t.coefficientId}}`;
                    } else {
                        // Check if source is an arrow (arrow-to-arrow connection)
                        const isArrowToArrow = t.sourceVar instanceof Arrow;
                        if (isArrowToArrow) {
                            return t.type === 'promote' ? 
                                `\\frac{${t.sourceVar.startVariable.text}^h}{k_${t.kmId} + ${t.sourceVar.startVariable.text}^h}` : 
                                `-${t.sourceVar.startVariable.text}${t.targetVar.text}`;
                        } else {
                            return t.type === 'promote' ? 
                                `\\frac{${t.sourceVar.text}^h}{k_${t.kmId} + ${t.sourceVar.text}^h}` : 
                                `-${t.sourceVar.text}${t.targetVar.text}`;
                        }
                    }
                });
                
                const coefficient = getNextCoefficient();
                const termString = this.logicType === 'and' ? 
                    termStringsWithoutCoefficient.join(' \\cdot ') : 
                    termStringsWithoutCoefficient.join(' + ');

                let termStringWithConstant = `c_{${coefficient}}` + termString;
                
                return isFirstTerm ? termStringWithConstant : `+${termStringWithConstant}`;
            }
        }

        // Handle individual terms
        let termString;
        if (this.isConstant) {
            termString = this.type === 'promote' ? 
                `c_{${this.coefficientId}}` : 
                `-c_{${this.coefficientId}}`;
        } else {
            // Check if source is an arrow (arrow-to-arrow connection)
            const isArrowToArrow = this.sourceVar instanceof Arrow;
            if (isArrowToArrow) {
                termString = this.type === 'promote' ? 
                    `c_{${this.coefficientId}} \\frac{${this.sourceVar.startVariable.text}^h}{k_${this.kmId} + ${this.sourceVar.startVariable.text}^h}` : 
                    `-c_{${this.coefficientId}} ${this.sourceVar.startVariable.text}${this.targetVar.text}`;
            } else {
                termString = this.type === 'promote' ? 
                    `c_{${this.coefficientId}} \\frac{${this.sourceVar.text}^h}{k_${this.kmId} + ${this.sourceVar.text}^h}` : 
                    `-c_{${this.coefficientId}} ${this.sourceVar.text}${this.targetVar.text}`;
            }
        }
        
        return isFirstTerm ? termString : `+${termString}`;
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

// Function to calculate equations from scratch based on arrows
function calculateEquationsFromArrows() {
    // Store existing constant terms
    const constantTerms = new Map();
    equations.forEach((terms, variable) => {
        const constants = terms.filter(term => term.isConstant);
        if (constants.length > 0) {
            constantTerms.set(variable, constants);
        }
    });

    // Clear existing equations
    equations.clear();
    
    // Group arrows by their target variable
    const arrowsByTarget = new Map();
    
    arrows.forEach(arrow => {
        const targetVar = arrow.endVariable instanceof Arrow ? 
            arrow.endVariable.endVariable : arrow.endVariable;
            
        if (!arrowsByTarget.has(targetVar)) {
            arrowsByTarget.set(targetVar, []);
        }
        arrowsByTarget.get(targetVar).push(arrow);
    });
    
    // For each target variable, create terms from its incoming arrows
    arrowsByTarget.forEach((incomingArrows, targetVar) => {
        const terms = [];
        
        // Group arrows by their AND groups
        const andGroups = new Map();
        incomingArrows.forEach(arrow => {
            if (arrow.isAndConnection && arrow.andGroupId) {
                if (!andGroups.has(arrow.andGroupId)) {
                    andGroups.set(arrow.andGroupId, []);
                }
                andGroups.get(arrow.andGroupId).push(arrow);
            } else {
                // Single arrow terms
                terms.push(new Term(arrow.startVariable, targetVar, arrow.type));
            }
        });
        
        // Add terms for AND groups
        andGroups.forEach(arrows => {
            // Create AND group for any number of arrows (including 2)
            const groupTerms = arrows.map(arrow => 
                new Term(arrow.startVariable, targetVar, arrow.type)
            );
            
            // Set logic group properties
            const groupId = arrows[0].andGroupId;
            groupTerms.forEach(term => {
                term.logicGroup = groupId;
                term.logicType = 'and';
            });
            
            terms.push(...groupTerms);
        });
        
        // Add back any constant terms for this variable
        if (constantTerms.has(targetVar.text)) {
            terms.push(...constantTerms.get(targetVar.text));
        }
        
        equations.set(targetVar.text, terms);
    });

    // Add equations for variables that only have constant terms
    constantTerms.forEach((terms, variable) => {
        if (!equations.has(variable)) {
            equations.set(variable, terms);
        }
    });
}

function updateEquationsList() {
    // Reset the counters whenever we update the equations list
    globalCoefficientCounter = 0; // Reset coefficient counter
    globalKMCounter = 0; // Reset KM counter

    // Calculate equations from scratch
    calculateEquationsFromArrows();

    // Assign IDs to all terms
    equations.forEach((terms, variable) => {
        terms.forEach(term => {
            if (!term.coefficientId) {
                term.coefficientId = getNextCoefficient();
            }
            // Only assign KM ID for promoting arrows
            if (!term.isConstant && term.type === 'promote' && !term.kmId) {
                term.kmId = getNextKM();
            }
        });
    });

    const equationsList = document.getElementById('equationsList');
    equationsList.innerHTML = Array.from(equations.entries()).map(([variable, terms], index) => {
        console.log(`Generating equation for ${variable}:`, terms);
        return `
        <div class="equation-item">
            <div class="equation-content">$$\\frac{d${variable}}{dt}=${terms.map((term, i) => term.toString(i === 0)).join(' ')}$$</div>
            <button onclick="deleteEquation('${variable}')" class="delete-equation">×</button>
        </div>
        `;
    }).join('');

    // Update initial conditions list - show all variables, not just those with equations
    const initialConditionsList = document.getElementById('initialConditionsList');
    initialConditionsList.innerHTML = activeVariables.map(variable => {
        const value = initialConditions.get(variable.text) || 1; // Default to 1 if not set
        return `
            <div class="parameter-item">
                <span class="parameter-label">${variable.text}(0) =</span>
                <input type="number" class="parameter-input" value="${value}" 
                    onchange="updateInitialCondition('${variable.text}', this.value)" step="0.1">
            </div>
        `;
    }).join('');

    // Update parameters list
    const parametersList = document.getElementById('parametersList');
    const allParameters = new Set();
    
    // Collect all parameters from equations
    equations.forEach((terms, variable) => {
        terms.forEach(term => {
            allParameters.add(`c_${term.coefficientId}`);
            // Only add KM constant for promoting arrows
            if (!term.isConstant && term.type === 'promote') {
                allParameters.add(`k_${term.kmId}`);
            }
        });
    });

    parametersList.innerHTML = Array.from(allParameters).map(param => {
        const value = parameters.get(param) || '1';
        return `
            <div class="parameter-item">
                <span class="parameter-label">${param} =</span>
                <input type="number" class="parameter-input" value="${value}" 
                    onchange="updateParameter('${param}', this.value)" step="0.1">
            </div>
        `;
    }).join('');
    
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
        
        // Set default initial condition to 1 if not already set
        if (!initialConditions.has(text)) {
            initialConditions.set(text, 1);
        }
        
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

    getIntersectionPoint(angle, isAndConnection = false) {
        const centerX = this.x + this.radius;
        const centerY = this.y + this.radius;
        // Move intersection point slightly ourtward (1.1 of radius for regular arrows, 1.2 for AND connections)
        const factor = isAndConnection ? 1.2 : 1.1;
        return {
            x: centerX + this.radius * factor * Math.cos(angle),
            y: centerY + this.radius * factor * Math.sin(angle)
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
        this.isDotted = false;
        this.color = '#000000'; // Default black color
        this.isAndConnection = false; // Flag for AND connections
        this.andGroupId = null; // Store the AND group ID
    }

    // Helper method to calculate average angle for multiple arrows
    calculateAverageAngle(arrow) {
        // Skip if the arrow isn't part of an AND group
        if (!arrow.isAndConnection || !arrow.andGroupId) {
            return null;
        }

        // Get the target variable
        const targetVar = arrow.endVariable instanceof Arrow ? 
            arrow.endVariable.endVariable : arrow.endVariable;

        // Find all arrows in the same AND group
        const groupArrows = arrows.filter(a => 
            a.isAndConnection && 
            a.andGroupId === arrow.andGroupId
        );

        if (groupArrows.length === 0) {
            return null;
        }

        // Calculate angles for each arrow in the group
        const angles = groupArrows.map(a => {
            const startCenterX = a.startVariable.x + a.startVariable.radius;
            const startCenterY = a.startVariable.y + a.startVariable.radius;
            const endCenterX = targetVar.x + targetVar.radius;
            const endCenterY = targetVar.y + targetVar.radius;
            
            // Calculate angle from start to end
            let angle = Math.atan2(endCenterY - startCenterY, endCenterX - startCenterX);
            
            // Normalize angle to be between -PI and PI
            while (angle > Math.PI) angle -= 2 * Math.PI;
            while (angle < -Math.PI) angle += 2 * Math.PI;
            
            return angle;
        });

        // Calculate average angle using vector addition
        const sumX = angles.reduce((sum, angle) => sum + Math.cos(angle), 0);
        const sumY = angles.reduce((sum, angle) => sum + Math.sin(angle), 0);
        let avgAngle = Math.atan2(sumY, sumX);

        // Normalize the average angle
        while (avgAngle > Math.PI) avgAngle -= 2 * Math.PI;
        while (avgAngle < -Math.PI) avgAngle += 2 * Math.PI;

        return avgAngle;
    }

    getMidpoint() {
        if (this.isSelfConnecting) {
            const startCenterX = this.startVariable.x + this.startVariable.radius;
            const startCenterY = this.startVariable.y + this.startVariable.radius;
            
            let baseAngle = (this.type === 'promote') ? 0. : Math.PI;
            let startAngle = baseAngle - Math.PI / 6;
            let endAngle = baseAngle + Math.PI / 6;

            // a magic number that works with Bezier. Maybe calculate later
            let magicBezierNumber = 3.3

            // Calculate control points (same as in drawSelfConnectingCurve)
            const controlPoint1 = {
                x: startCenterX + this.startVariable.radius * magicBezierNumber * Math.cos(startAngle),
                y: startCenterY + this.startVariable.radius * magicBezierNumber * Math.sin(startAngle)
            };
            
            const controlPoint2 = {
                x: startCenterX + this.startVariable.radius * magicBezierNumber * Math.cos(endAngle),
                y: startCenterY + this.startVariable.radius * magicBezierNumber * Math.sin(endAngle)
            };

            // Calculate midpoint of the curve using the control points
            return {
                x: (controlPoint1.x + controlPoint2.x) / 2,
                y: (controlPoint1.y + controlPoint2.y) / 2
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

    // Helper method to draw arrow head
    drawArrowHead(ctx, endPoint, angle) {
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;
        
        // Set color for arrow head
        ctx.fillStyle = this.color;
        
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
    }

    // Helper method to draw T-bar
    drawTBar(ctx, endPoint, angle) {
        const barLength = 18;
        const barAngle = Math.PI / 2;
        const barX1 = endPoint.x - (barLength/2) * Math.cos(angle - barAngle);
        const barY1 = endPoint.y - (barLength/2) * Math.sin(angle - barAngle);
        const barX2 = endPoint.x + (barLength/2) * Math.cos(angle - barAngle);
        const barY2 = endPoint.y + (barLength/2) * Math.sin(angle - barAngle);
        
        // Set color for T-bar
        ctx.strokeStyle = this.color;
        
        ctx.beginPath();
        ctx.moveTo(barX1, barY1);
        ctx.lineTo(barX2, barY2);
        ctx.stroke();
    }

    // Helper method to draw self-connecting curve
    drawSelfConnectingCurve(ctx, startCenterX, startCenterY) {
        const radius = this.startVariable.radius * 1.5;
            let baseAngle = (this.type === 'promote') ? 0. : Math.PI;
            let startAngle = baseAngle - Math.PI / 6;
            let endAngle = baseAngle + Math.PI / 6;

        // Calculate points
            const startPoint = {
                x: startCenterX + this.startVariable.radius * Math.cos(startAngle),
                y: startCenterY + this.startVariable.radius * Math.sin(startAngle)
            };
            
            const endPoint = {
                x: startCenterX + this.startVariable.radius * 1.2 * Math.cos(endAngle),
                y: startCenterY + this.startVariable.radius * 1.2 * Math.sin(endAngle)
            };
            
            const controlPoint1 = {
                x: startCenterX + this.startVariable.radius * 4. * Math.cos(startAngle),
            y: startCenterY + this.startVariable.radius * 4. * Math.sin(startAngle)
            };
            
            const controlPoint2 = {
                x: startCenterX + this.startVariable.radius * 4. * Math.cos(endAngle),
            y: startCenterY + this.startVariable.radius * 4. * Math.sin(endAngle)
            };
        
        // Set color for curve
        ctx.strokeStyle = this.color;
            
            // Draw the curve
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.bezierCurveTo(
                controlPoint1.x, controlPoint1.y,
                controlPoint2.x, controlPoint2.y,
                endPoint.x, endPoint.y
            );
            ctx.stroke();

        // Draw arrow head or T-bar
            if (this.type === 'promote') {
                const tangentAngle = 2*Math.PI *7/12;
            this.drawArrowHead(ctx, endPoint, tangentAngle);
        } else {
            const barAngle = Math.PI*1.15;
            this.drawTBar(ctx, endPoint, barAngle);
        }

        return endPoint;
    }

    // Helper method to draw straight line
    drawStraightLine(ctx, startCenterX, startCenterY) {
        let endPoint, endAngle;

        if (this.isArrowToArrow) {
            // For arrow-to-arrow connections, we need to find where the target arrow connects
            const targetArrow = this.endVariable;
            const targetStartCenterX = targetArrow.startVariable.x + targetArrow.startVariable.radius;
            const targetStartCenterY = targetArrow.startVariable.y + targetArrow.startVariable.radius;
            
            // Calculate the angle to the target arrow's end
            if (targetArrow.isSelfConnecting) {
                // For self-connecting arrows, use the end angle of the curve
                let baseAngle = (targetArrow.type === 'promote') ? 0. : Math.PI;
                let curveEndAngle = baseAngle + Math.PI / 6;
                endAngle = curveEndAngle;
                endPoint = {
                    x: targetStartCenterX + targetArrow.startVariable.radius * 1.2 * Math.cos(curveEndAngle),
                    y: targetStartCenterY + targetArrow.startVariable.radius * 1.2 * Math.sin(curveEndAngle)
                };
        } else {
                // For regular arrows, calculate angle to the end variable
                const targetEndCenterX = targetArrow.endVariable.x + targetArrow.endVariable.radius;
                const targetEndCenterY = targetArrow.endVariable.y + targetArrow.endVariable.radius;
                endAngle = Math.atan2(targetEndCenterY - targetStartCenterY, targetEndCenterX - targetStartCenterX);
                
                // Get the intersection point with the end variable
                endPoint = targetArrow.endVariable.getIntersectionPoint(endAngle + Math.PI, this.isAndConnection);
            }
            } else {
                const endCenterX = this.endVariable.x + this.endVariable.radius;
                const endCenterY = this.endVariable.y + this.endVariable.radius;
        
            // Try to get average angle for multiple arrows
            const avgAngle = this.calculateAverageAngle(this);
            if (avgAngle !== null) {
                endAngle = avgAngle;
            } else {
                endAngle = Math.atan2(endCenterY - startCenterY, endCenterX - startCenterX);
            }
            
            endPoint = this.endVariable.getIntersectionPoint(endAngle + Math.PI, this.isAndConnection);
        }

        // Calculate the angle from start to end point for the start intersection
        const startAngle = Math.atan2(endPoint.y - startCenterY, endPoint.x - startCenterX);
        const startPoint = this.startVariable.getIntersectionPoint(startAngle, this.isAndConnection);

        // Set color for line
        ctx.strokeStyle = this.color;

            // Draw line
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();

        // Draw arrow head or T-bar
            if (this.type === 'promote') {
            this.drawArrowHead(ctx, endPoint, startAngle);
        } else {
            this.drawTBar(ctx, endPoint, startAngle);
        }

        return endPoint;
    }

    // Helper method to draw AND indicator
    drawAndIndicator(ctx, x, y) {
        const radius = 4;
                ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#4C0050'; // Color for AND indicator
                ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
                ctx.stroke();
            }

    draw(ctx) {
        const startCenterX = this.startVariable.x + this.startVariable.radius;
        const startCenterY = this.startVariable.y + this.startVariable.radius;
        
        // Set line style based on isDotted property
        if (this.isDotted) {
            ctx.setLineDash([5, 5]);
        } else {
            ctx.setLineDash([]);
        }
        
        // Set color based on AND group if applicable
        if (this.isAndConnection && this.andGroupId) {
            ctx.strokeStyle = getAndGroupColor(this.andGroupId);
            ctx.fillStyle = getAndGroupColor(this.andGroupId);
        } else {
            ctx.strokeStyle = this.color;
            ctx.fillStyle = this.color;
        }
        
        // Draw the main line
        let endPoint;
        if (this.isSelfConnecting) {
            endPoint = this.drawSelfConnectingCurve(ctx, startCenterX, startCenterY);
        } else {
            endPoint = this.drawStraightLine(ctx, startCenterX, startCenterY);
        }
        
        // Draw AND indicator if this is an AND connection
        if (this.isAndConnection) {
            this.drawAndIndicator(ctx, endPoint.x, endPoint.y);
        }
        
        // Reset line style
        ctx.setLineDash([]);
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize canvas
    const canvas = document.getElementById('mainCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get canvas context!');
        return;
    }

    // Helper function to draw connection points
    function drawConnectionPoint(ctx, x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#4CAF50';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

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

    // Add right-click menu functionality
    canvas.addEventListener('contextmenu', (e) => {
        console.log('Context menu event triggered');
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Find what was right-clicked
        const rightClickedVariable = activeVariables.find(variable => variable.isPointInside(x, y));
        const rightClickedArrow = !rightClickedVariable ? findArrowUnderPoint(x, y) : null;
        
        // Store the right-clicked object
        rightClickedObject = rightClickedVariable || rightClickedArrow;
        
        console.log('Right clicked:', {
            variable: rightClickedVariable ? rightClickedVariable.text : null,
            arrow: rightClickedArrow ? 'Arrow found' : null,
            x, y
        });
        
        // Hide both menus first
        document.getElementById('contextMenu').style.display = 'none';
        document.getElementById('arrowContextMenu').style.display = 'none';
        
        if (rightClickedVariable) {
            console.log('Showing variable context menu for:', rightClickedVariable.text);
            // Show variable context menu
            const menu = document.getElementById('contextMenu');
            
            // Check if variable has constant terms
            const terms = equations.get(rightClickedVariable.text) || [];
            const hasSource = terms.some(term => term.isConstant && term.type === 'promote');
            const hasDegradation = terms.some(term => term.isConstant && term.type === 'inhibit');
            
            // Update button text and IDs
            const sourceButton = document.getElementById('toggleConstantSource');
            const degradationButton = document.getElementById('toggleConstantDegradation');
            
            sourceButton.textContent = hasSource ? 'Remove Constant Source' : 'Add Constant Source';
            degradationButton.textContent = hasDegradation ? 'Remove Constant Degradation' : 'Add Constant Degradation';
            
            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            e.preventDefault(); // Prevent default context menu
        } else if (rightClickedArrow) {
            console.log('Showing arrow context menu');
            // Show arrow context menu
            const menu = document.getElementById('arrowContextMenu');
            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            e.preventDefault(); // Prevent default context menu
        }
        // If neither variable nor arrow was clicked, let the default context menu show
    });

    // Add event listeners for toggle buttons
    document.getElementById('toggleConstantSource').addEventListener('click', (e) => {
        console.log('Toggle constant source clicked');
        e.stopPropagation(); // Prevent the click from bubbling up
        console.log('Right clicked object:', rightClickedObject);
        if (rightClickedObject instanceof ActiveVariable) {
            const terms = equations.get(rightClickedObject.text) || [];
            const hasSource = terms.some(term => term.isConstant && term.type === 'promote');
            
            if (hasSource) {
                // Remove constant source
                console.log('Removing constant source from variable:', rightClickedObject.text);
                const nonSourceTerms = terms.filter(term => !(term.isConstant && term.type === 'promote'));
                equations.set(rightClickedObject.text, nonSourceTerms);
            } else {
                // Add constant source
                console.log('Adding constant source to variable:', rightClickedObject.text);
                const newTerm = new Term(null, rightClickedObject, 'promote', null, false, null, true);
                terms.push(newTerm);
                equations.set(rightClickedObject.text, terms);
            }
            
            console.log('Updated terms for variable:', rightClickedObject.text, equations.get(rightClickedObject.text));
            updateEquationsList();
            redraw();
        } else {
            console.log('No variable selected for toggling constant source. Right clicked object:', rightClickedObject);
        }
        document.getElementById('contextMenu').style.display = 'none';
    });

    document.getElementById('toggleConstantDegradation').addEventListener('click', (e) => {
        console.log('Toggle constant degradation clicked');
        e.stopPropagation(); // Prevent the click from bubbling up
        console.log('Right clicked object:', rightClickedObject);
        if (rightClickedObject instanceof ActiveVariable) {
            const terms = equations.get(rightClickedObject.text) || [];
            const hasDegradation = terms.some(term => term.isConstant && term.type === 'inhibit');
            
            if (hasDegradation) {
                // Remove constant degradation
                console.log('Removing constant degradation from variable:', rightClickedObject.text);
                const nonDegradationTerms = terms.filter(term => !(term.isConstant && term.type === 'inhibit'));
                equations.set(rightClickedObject.text, nonDegradationTerms);
            } else {
                // Add constant degradation
                console.log('Adding constant degradation to variable:', rightClickedObject.text);
                const newTerm = new Term(null, rightClickedObject, 'inhibit', null, false, null, true);
                terms.push(newTerm);
                equations.set(rightClickedObject.text, terms);
            }
            
            console.log('Updated terms for variable:', rightClickedObject.text, equations.get(rightClickedObject.text));
            updateEquationsList();
            redraw();
        } else {
            console.log('No variable selected for toggling constant degradation. Right clicked object:', rightClickedObject);
        }
        document.getElementById('contextMenu').style.display = 'none';
    });

    // Add click event listener to hide menus when clicking elsewhere
    document.addEventListener('click', (e) => {
        console.log('Document click event');
        // Check if the click was on a context menu button
        const isContextMenuButton = e.target.closest('#contextMenu button') || e.target.closest('#arrowContextMenu button');
        console.log('Is context menu button:', isContextMenuButton);
        if (!isContextMenuButton) {
            document.getElementById('contextMenu').style.display = 'none';
            document.getElementById('arrowContextMenu').style.display = 'none';
            rightClickedObject = null; // Clear the right-clicked object when menu is closed
        }
    });

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
        console.log('setArrowMode called with type:', type);
        console.log('Current state - isDrawingArrow:', isDrawingArrow, 'arrowType:', arrowType);
        
        // If we're clicking the same type that's already active, turn it off
        if (type === arrowType && isDrawingArrow) {
            console.log('Toggling off arrow mode - same type clicked');
            isDrawingArrow = false;
            arrowType = null;
            // UI feedback
            document.getElementById('drawPromoteArrow').style.backgroundColor = '#4CAF50';
            document.getElementById('drawInhibitArrow').style.backgroundColor = '#4CAF50';
            // Update cursor
            canvas.style.cursor = 'grab';
        } else {
            console.log('Setting new arrow mode');
            isDrawingArrow = true;
            arrowType = type;
            // UI feedback
            document.getElementById('drawPromoteArrow').style.backgroundColor = (type === 'promote') ? '#ff9800' : '#4CAF50';
            document.getElementById('drawInhibitArrow').style.backgroundColor = (type === 'inhibit') ? '#ff9800' : '#4CAF50';
            // Update cursor
            canvas.style.cursor = 'crosshair';
        }
        console.log('New state - isDrawingArrow:', isDrawingArrow, 'arrowType:', arrowType);
    }

    document.getElementById('drawPromoteArrow').addEventListener('click', () => {
        console.log('Promote arrow button clicked');
        setDeleteMode(false);
        setArrowMode('promote');
    });

    document.getElementById('drawInhibitArrow').addEventListener('click', () => {
        console.log('Inhibit arrow button clicked');
        setDeleteMode(false);
        setArrowMode('inhibit');
    });

    function setDeleteMode(enabled) {
        isDeleteMode = enabled;
        if (enabled) {
            isDrawingArrow = false;
            arrowType = null;
        }
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
            startVariable = activeVariables.find(variable => variable.isPointInside(x - panOffsetX, y - panOffsetY));
            if (startVariable) {
                canvas.style.cursor = 'crosshair';
            }
        } else if (isDeleteMode) {
            // Handle delete mode
        } else {
            // Check if we're clicking on a variable
            selectedVariable = activeVariables.find(variable => variable.isPointInside(x - panOffsetX, y - panOffsetY));
            if (selectedVariable) {
                selectedVariable.isDragging = true;
                selectedVariable.dragOffsetX = x - panOffsetX - selectedVariable.x;
                selectedVariable.dragOffsetY = y - panOffsetY - selectedVariable.y;
                canvas.style.cursor = 'move';
            } else {
                // Start panning if not clicking on anything
                isPanning = true;
                panStartX = x;
                panStartY = y;
                canvas.style.cursor = 'grab';
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isPanning) {
            // Update pan offset
            panOffsetX += x - panStartX;
            panOffsetY += y - panStartY;
            panStartX = x;
            panStartY = y;
            canvas.style.cursor = 'grabbing';
            redraw();
            return;
        }

        // Reset hover state for all variables
        activeVariables.forEach(variable => {
            variable.isHovered = false;
        });

        // Find hovered variable or arrow
        const hoveredVariable = activeVariables.find(variable => variable.isPointInside(x - panOffsetX, y - panOffsetY));
        const hoveredArrow = !hoveredVariable ? findArrowUnderPoint(x - panOffsetX, y - panOffsetY) : null;
        
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
                    canvas.style.cursor = 'grab';
                }
            }
        }

        // Handle dragging
        if (selectedVariable && selectedVariable.isDragging) {
            selectedVariable.x = x - panOffsetX - selectedVariable.dragOffsetX;
            selectedVariable.y = y - panOffsetY - selectedVariable.dragOffsetY;
            redraw();
        } else {
            redraw();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'grab';
        }

        if (isDeleteMode && hoveredForDeletion) {
            if (hoveredForDeletion instanceof ActiveVariable) {
                // Delete all arrows connected to this variable
                arrows = arrows.filter(arrow => {
                    const isConnected = arrow.startVariable === hoveredForDeletion || 
                                      arrow.endVariable === hoveredForDeletion ||
                                      (arrow.endVariable instanceof Arrow && 
                                       arrow.endVariable.endVariable === hoveredForDeletion);
                    return !isConnected;
                });
                // Delete the variable
                activeVariables = activeVariables.filter(v => v !== hoveredForDeletion);
            } else if (hoveredForDeletion instanceof Arrow) {
                // Delete the arrow
                arrows = arrows.filter(arrow => arrow !== hoveredForDeletion);
                arrows = arrows.filter(arrow => arrow.endVariable !== hoveredForDeletion);
            }
            hoveredForDeletion = null;
            updateEquationsList();
            return;
        }

        if (isDrawingArrow && startVariable) {
            const endVariable = activeVariables.find(variable => variable.isPointInside(x - panOffsetX, y - panOffsetY));
            const endArrow = !endVariable ? findArrowUnderPoint(x - panOffsetX, y - panOffsetY) : null;
            const target = endVariable || endArrow;

            if (target) {
                // Handle arrow-to-arrow connections
                if (endArrow) {
                    if (!sharesStartNode(startVariable, endArrow)) {
                        // Get the final target variable (end of the arrow chain)
                        const finalTarget = endArrow.endVariable instanceof Arrow ? 
                            endArrow.endVariable.endVariable : endArrow.endVariable;

                        // Find the AND group of the connected arrow
                        let existingAndGroupId = endArrow.andGroupId;

                        // Create the new arrow
                        const newArrow = new Arrow(startVariable, finalTarget, arrowType);
                        newArrow.isAndConnection = true;
                        
                        // Use existing AND group ID or create new one
                        if (existingAndGroupId) {
                            // Use the AND group ID from the first existing arrow
                            newArrow.andGroupId = existingAndGroupId;
                        } else {
                            // Create new AND group
                            const newGroupId = Date.now();
                            newArrow.andGroupId = newGroupId;
                            // Also set the existing arrow's AND group
                            endArrow.isAndConnection = true;
                            endArrow.andGroupId = newGroupId;
                        }
                        
                        arrows.push(newArrow);
                    }
                } else if (!connectionExists(startVariable, target, arrowType)) {
                    // Regular variable-to-variable connection
                    arrows.push(new Arrow(startVariable, target, arrowType));
                }
                
                // Update equations
                updateEquationsList();
            }
            // Reset arrow drawing state
            startVariable = null;
            isDrawingArrow = false;
            arrowType = null;
            // Reset UI feedback
            document.getElementById('drawPromoteArrow').style.backgroundColor = '#4CAF50';
            document.getElementById('drawInhibitArrow').style.backgroundColor = '#4CAF50';
            // Set cursor back to grab for panning
            canvas.style.cursor = 'grab';
            redraw();
        }

        if (selectedVariable) {
            selectedVariable.isDragging = false;
            selectedVariable = null;
            canvas.style.cursor = 'default';
        }
    });

    // Update the redraw function to use pan offset
    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Save the current context state
        ctx.save();
        
        // Apply pan offset
        ctx.translate(panOffsetX, panOffsetY);
        
        // Draw arrows
        arrows.forEach(arrow => {
            // Store original color
            const originalColor = arrow.color;
            
            if (isDeleteMode && arrow === hoveredForDeletion) {
                arrow.color = '#ff0000'; // Red for delete mode hover
                ctx.lineWidth = 4;
            } else if (arrow === hoveredForRightClick) {
                arrow.color = '#2196F3'; // Blue for right-click hover
                ctx.lineWidth = 3;
            } else {
                ctx.lineWidth = 2;
            }
            
            arrow.draw(ctx);
            
            // Restore original color
            arrow.color = originalColor;
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
                lastMouseX - canvas.getBoundingClientRect().left - panOffsetX,
                lastMouseY - canvas.getBoundingClientRect().top - panOffsetY
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
                        drawConnectionPoint(ctx, point.x, point.y);
                    }
                });

                // Draw arrow midpoints
                arrows.forEach(arrow => {
                    if (!connectionExists(startVariable, arrow, arrowType) && !sharesStartNode(startVariable, arrow)) {
                        const midpoint = arrow.getMidpoint();
                        drawConnectionPoint(ctx, midpoint.x, midpoint.y);
                    }
                });
            }

            if (!hoveredVariable && !hoveredArrow) {
                // Draw semi-transparent grey overlay
                ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
                ctx.fillRect(-panOffsetX, -panOffsetY, canvas.width, canvas.height);
            }
        }

        // Restore the context state
        ctx.restore();
    }

    // Add toggle equations functionality
    document.getElementById('toggleEquations').addEventListener('click', () => {
        const panel = document.getElementById('equationsPanel');
        const button = document.getElementById('toggleEquations');
        // const container = document.querySelector('.container'); // Get the container - no longer needed
        
        panel.classList.toggle('hidden');
        // container.classList.toggle('equations-panel-visible', !panel.classList.contains('hidden')); // Toggle class on container - no longer needed

        button.textContent = panel.classList.contains('hidden') ? 'Show Equations' : 'Hide Equations';
    });

    // Helper function to update equation with new term
    function updateEquationWithArrow(startVar, endVar, type) {
        console.log('Updating equation:', { startVar, endVar, type });
        
        // Get the target variable for the equation
        const targetVar = endVar instanceof Arrow ? endVar.endVariable : endVar;
        
        // Initialize terms array if it doesn't exist
        if (!equations.has(targetVar.text)) {
            equations.set(targetVar.text, []);
        }
        
        let terms = equations.get(targetVar.text);
        
        // Create new term
        const newTerm = new Term(startVar, targetVar, type);
        
        // Find existing terms for the target variable that are part of an AND group
        const existingAndTerms = terms.filter(term => term.logicType === 'and');
        
        let groupId;
        if (existingAndTerms.length > 0) {
            // Add to existing AND group
            groupId = existingAndTerms[0].logicGroup;
            newTerm.logicGroup = groupId;
            newTerm.logicType = 'and';
            
            // Ensure all related terms are in the same group
            existingAndTerms.forEach(term => {
                term.logicGroup = groupId;
                term.logicType = 'and';
            });
        } else {
            // Create a new AND group
            groupId = Date.now();
            newTerm.logicGroup = groupId;
            newTerm.logicType = 'and';
        }
        
        terms.push(newTerm);
        equations.set(targetVar.text, terms);
        updateEquationsList();
        
        // Set the AND group ID for the arrow
        const newArrow = arrows[arrows.length - 1];
        if (newArrow) {
            newArrow.isAndConnection = true;
            newArrow.andGroupId = groupId;
        }
    }

    // Add after the Term class and before the DOMContentLoaded event listener

    class Simulation {
        constructor(equations, initialConditions, parameters) {
            this.equations = equations;
            this.initialConditions = initialConditions;
            this.parameters = parameters;
            this.results = new Map();
            this.timePoints = [];
        }

        evaluateTerm(term, state) {
            if (term.isConstant) {
                const c = this.parameters.get(`c_${term.coefficientId}`) || 1;
                return term.type === 'promote' ? c : -c;
            }

            const c = this.parameters.get(`c_${term.coefficientId}`) || 1;
            const isArrowToArrow = term.sourceVar instanceof Arrow;
            const sourceVar = isArrowToArrow ? term.sourceVar.startVariable.text : term.sourceVar.text;
            const sourceValue = state.get(sourceVar) || 0;
            const targetValue = state.get(term.targetVar.text) || 0;

            if (term.type === 'promote') {
                const k = this.parameters.get(`k_${term.kmId}`) || 1;
                return c * Math.pow(sourceValue, 2) / (k + Math.pow(sourceValue, 2));
            } else {
                // Negative coefficient term with both source and target variables
                return -c * sourceValue * targetValue;
            }
        }

        evaluateEquation(variable, state) {
            const terms = this.equations.get(variable) || [];
            
            // Handle AND logic groups
            const processedTerms = new Set();
            let result = 0;
            
            for (const term of terms) {
                // Skip if we've already processed this term as part of a group
                if (processedTerms.has(term)) continue;
                
                if (term.logicGroup !== null) {
                    // Find all terms in this logic group
                    const groupTerms = terms.filter(t => t.logicGroup === term.logicGroup);
                    groupTerms.forEach(t => processedTerms.add(t));
                    
                    if (term.logicType === 'and') {
                        // For AND logic, multiply the terms
                        const groupResult = groupTerms.reduce((product, t) => {
                            const termValue = this.evaluateTerm(t, state);
                            return product * termValue;
                        }, 1);
                        result += groupResult;
                    } else {
                        // For OR logic, add the terms
                        const groupResult = groupTerms.reduce((sum, t) => {
                            const termValue = this.evaluateTerm(t, state);
                            return sum + termValue;
                        }, 0);
                        result += groupResult;
                    }
                } else {
                    // Handle individual terms
                    processedTerms.add(term);
                    result += this.evaluateTerm(term, state);
                }
            }
            
            return result;
        }

        run(numSteps, dt) {
            // Initialize results
            this.timePoints = Array.from({ length: numSteps + 1 }, (_, i) => i * dt);
            this.results.clear();
            
            // Initialize state with initial conditions
            const state = new Map(this.initialConditions);
            
            // Initialize arrays for all variables in equations
            for (const variable of this.equations.keys()) {
                this.results.set(variable, []);
            }
            
            // Store initial values
            for (const [variable, value] of state) {
                if (this.results.has(variable)) {
                    this.results.get(variable).push(value);
                }
            }

            // Run simulation
            for (let step = 0; step < numSteps; step++) {
                const newState = new Map();
                
                // Calculate new values for each variable
                for (const variable of this.equations.keys()) {
                    const currentValue = state.get(variable) || 0;
                    const derivative = this.evaluateEquation(variable, state);
                    let newValue = currentValue + derivative * dt;
                    // Ensure value doesn't go below 0
                    newValue = Math.max(0, newValue);
                    newState.set(variable, newValue);
                    this.results.get(variable).push(newValue);
                }
                
                // Update state
                for (const [variable, value] of newState) {
                    state.set(variable, value);
                }
            }
        }

        plot(canvas) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const padding = 40;

            // Clear canvas
            ctx.clearRect(0, 0, width, height);

            // Find min and max values for scaling
            let minY = Infinity;
            let maxY = -Infinity;
            for (const values of this.results.values()) {
                minY = Math.min(minY, ...values);
                maxY = Math.max(maxY, ...values);
            }
            minY = Math.min(0, minY); // Include 0 in the range
            maxY = Math.max(0, maxY);

            // Add some padding to the y-range
            const yRange = maxY - minY;
            minY -= yRange * 0.1;
            maxY += yRange * 0.1;

            // Draw axes
            ctx.beginPath();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            
            // X-axis
            ctx.moveTo(padding, height - padding);
            ctx.lineTo(width - padding, height - padding);
            
            // Y-axis
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, height - padding);
            ctx.stroke();

            // Draw time labels
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const maxTime = this.timePoints[this.timePoints.length - 1];
            for (let t = 0; t <= maxTime; t += maxTime / 5) {
                const x = padding + (t / maxTime) * (width - 2 * padding);
                ctx.fillText(t.toFixed(1), x, height - padding + 5);
            }

            // Draw value labels
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let v = Math.ceil(minY); v <= Math.floor(maxY); v++) {
                const y = height - padding - ((v - minY) / (maxY - minY)) * (height - 2 * padding);
                ctx.fillText(v.toString(), padding - 5, y);
            }

            // Draw curves
            const colors = ['#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#00FFFF', '#FFA500'];
            let colorIndex = 0;

            for (const [variable, values] of this.results) {
                ctx.beginPath();
                ctx.strokeStyle = colors[colorIndex % colors.length];
                ctx.lineWidth = 2;

                values.forEach((value, i) => {
                    const x = padding + (this.timePoints[i] / maxTime) * (width - 2 * padding);
                    const y = height - padding - ((value - minY) / (maxY - minY)) * (height - 2 * padding);
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();

                // Draw legend
                ctx.fillStyle = colors[colorIndex % colors.length];
                ctx.textAlign = 'left';
                ctx.fillText(variable, padding + 10, padding + colorIndex * 20);
                colorIndex++;
            }
        }
    }

    // Add to the DOMContentLoaded event listener, after the existing code
    document.getElementById('runSimulation').addEventListener('click', () => {
        const numSteps = parseInt(document.getElementById('timeSteps').value);
        const dt = parseFloat(document.getElementById('timeStepSize').value);
        
        // Create simulation instance
        const simulation = new Simulation(equations, initialConditions, parameters);
        
        // Run simulation
        simulation.run(numSteps, dt);
        
        // Plot results
        const canvas = document.getElementById('simulationPlot');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        simulation.plot(canvas);
    });
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

// Add a helper function to check if an arrow connects to another arrow's head
function connectsToArrowHead(startVar, endArrow) {
    // Only allow connections to the head of another arrow
    return endArrow instanceof Arrow;
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