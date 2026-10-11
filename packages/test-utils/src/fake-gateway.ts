// The fake gateway of `chapterjs/src/testing/`, closed when the current
// test ends.
import { onTestFinished } from 'vitest';
import {
  fakeGateway as start,
  type FakeGateway,
  type FakeGatewayBehavior,
  type FakeGatewayConnection,
  type FakeGatewayPayload,
} from '../../chapterjs/src/testing/fake-gateway.js';

export type {
  FakeGateway,
  FakeGatewayBehavior,
  FakeGatewayConnection,
  FakeGatewayPayload,
};

/**
 * A local WebSocket server that plays the Discord gateway: tests run the
 * real connection code against it. By default it says Hello, acknowledges
 * heartbeats, answers Identify with Ready and Resume with Resumed; every
 * part of that can be changed through `behavior`, and each connection can
 * be driven by hand. Closed when the current test ends.
 */
export async function fakeGateway(
  options?: Partial<FakeGatewayBehavior>
): Promise<FakeGateway> {
  const fake = await start(options);
  onTestFinished(() => fake.close());
  return fake;
}
