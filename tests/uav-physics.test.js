import assert from 'node:assert/strict';
import { calculateFlightPlan, geodesicDistanceMeters } from '../src/utils/uavPhysics.js';

const takeoff = { lat: 33.3, lng: 44.3 };
const waypoint = { lat: 33.31, lng: 44.31 };
const distance = geodesicDistanceMeters(takeoff, waypoint);
assert.ok(distance > 1000 && distance < 2000);
const plan = calculateFlightPlan({ takeoff, waypoint, airspeedKmh: 60, enduranceMin: 30, reservePercent: 25 });
assert.ok(plan.etaMin > 0);
assert.ok(plan.returnMin > 0);
assert.ok(plan.roundTripMin > plan.etaMin);
assert.equal(plan.feasible, true);
const constrained = calculateFlightPlan({ takeoff, waypoint, airspeedKmh: 20, enduranceMin: 1, reservePercent: 25 });
assert.equal(constrained.feasible, false);
console.log('uav physics tests passed');
