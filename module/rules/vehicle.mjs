/**
 * Core Vehicle & Drone Rules
 */

/**
 * Determine the dice pool components based on control mode.
 * controlMode: 'manual', 'remote', 'jumpedIn', 'autopilot'
 * Returns mapped abstract attribute and skill values for testing.
 */
export function getControlPool(mode, operatorData, vehicleData) {
  switch (mode) {
    case "autopilot":
      // Autopilot relies entirely on its own Pilot rating
      return { attribute: vehicleData.pilot, skill: vehicleData.pilot, bonus: 0 };
      
    case "manual":
      // Manual driving uses Reaction + Piloting
      return { attribute: operatorData.reaction, skill: operatorData.piloting, bonus: 0 };
      
    case "remote":
      // Remote control (AR/VR) uses Logic or Reaction + Piloting
      return { attribute: operatorData.logic, skill: operatorData.piloting, bonus: 0 };
      
    case "jumpedIn":
      // Jumped in (VR with control rig) grants rig bonuses
      return { attribute: operatorData.logic, skill: operatorData.piloting, bonus: operatorData.controlRigRating || 0 };
      
    default:
      return { attribute: 0, skill: 0, bonus: 0 };
  }
}

/**
 * Chase Range Band helper
 */
export function getChaseRangeName(band) {
  const bands = ["Close", "Short", "Medium", "Long", "Extreme", "Out of Sight"];
  return bands[Math.max(0, Math.min(band, 5))];
}
