import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialPaymentState,
  transitionPayment,
  canTransitionPayment,
  PAYMENT_STATES,
  PAYMENT_ACTIONS,
} from '../src/domain/payments/paymentStateMachine.js';
import {
  createInitialDispatchState,
  transitionDispatch,
  canTransitionDispatch,
  DISPATCH_STATES,
  DISPATCH_ACTIONS,
} from '../src/domain/dispatch/dispatchStateMachine.js';
import { getPromptBuilder, PROMPT_VERSIONS } from '../src/services/promptService.js';
import { maskPhone } from '../src/utils/logger.js';

test('Payment State Machine: Standard Payment Link Flow', () => {
  const payment = createInitialPaymentState('ORD-501', 450, 'online');
  assert.equal(payment.status, PAYMENT_STATES.PAYMENT_PENDING);

  // Link Created
  const step1 = transitionPayment(payment, PAYMENT_ACTIONS.CREATE_LINK, {
    payment_link: 'https://rzp.io/i/test1234',
    provider_link_id: 'plink_123',
  });
  assert.equal(step1.success, true);
  assert.equal(step1.state.status, PAYMENT_STATES.PAYMENT_LINK_CREATED);
  assert.equal(step1.state.payment_link, 'https://rzp.io/i/test1234');

  // Customer Initiates Payment
  const step2 = transitionPayment(step1.state, PAYMENT_ACTIONS.PAYMENT_INITIATED);
  assert.equal(step2.success, true);
  assert.equal(step2.state.status, PAYMENT_STATES.PAYMENT_PROCESSING);

  // Payment Success
  const step3 = transitionPayment(step2.state, PAYMENT_ACTIONS.PAYMENT_SUCCESS, {
    provider_payment_id: 'pay_999xyz',
  });
  assert.equal(step3.success, true);
  assert.equal(step3.state.status, PAYMENT_STATES.PAYMENT_CONFIRMED);
  assert.equal(step3.state.provider_payment_id, 'pay_999xyz');
});

test('Payment State Machine: COD (Cash on Delivery) Flow', () => {
  const payment = createInitialPaymentState('ORD-502', 300, 'cod');
  assert.equal(payment.status, PAYMENT_STATES.PAYMENT_NOT_REQUIRED);
  assert.equal(payment.method, 'cod');
});

test('Payment State Machine: Illegal Transitions Rejected', () => {
  const payment = createInitialPaymentState('ORD-503', 200, 'online');
  // Cannot refund a pending payment
  const res = transitionPayment(payment, PAYMENT_ACTIONS.PROCESS_REFUND);
  assert.equal(res.success, false);
  assert.ok(res.error.includes('Illegal payment transition'));
});

test('Dispatch State Machine: Full Kitchen & Rider Lifecycle', () => {
  const dispatch = createInitialDispatchState('ORD-601', 'ondc');
  assert.equal(dispatch.status, DISPATCH_STATES.DISPATCH_PENDING);

  // 1. Merchant Accepts
  const step1 = transitionDispatch(dispatch, DISPATCH_ACTIONS.ACCEPT_ORDER, { merchant: 'Sree Annapoorna' });
  assert.equal(step1.success, true);
  assert.equal(step1.state.status, DISPATCH_STATES.DISPATCH_ACCEPTED);

  // 2. Kitchen Starts Preparing
  const step2 = transitionDispatch(step1.state, DISPATCH_ACTIONS.START_PREPARING);
  assert.equal(step2.success, true);
  assert.equal(step2.state.status, DISPATCH_STATES.PREPARING);

  // 3. Kitchen Marks Ready
  const step3 = transitionDispatch(step2.state, DISPATCH_ACTIONS.MARK_READY);
  assert.equal(step3.success, true);
  assert.equal(step3.state.status, DISPATCH_STATES.READY);

  // 4. Rider Assigned & Out for Delivery
  const step4 = transitionDispatch(step3.state, DISPATCH_ACTIONS.ASSIGN_RIDER, {
    rider_name: 'Muthu',
    rider_phone: '+919876543210',
    tracking_url: 'https://track.voicecart.in/live/ORD-601',
  });
  assert.equal(step4.success, true);
  assert.equal(step4.state.status, DISPATCH_STATES.OUT_FOR_DELIVERY);
  assert.equal(step4.state.rider_name, 'Muthu');

  // 5. Delivered
  const step5 = transitionDispatch(step4.state, DISPATCH_ACTIONS.MARK_DELIVERED);
  assert.equal(step5.success, true);
  assert.equal(step5.state.status, DISPATCH_STATES.DELIVERED);
});

test('Prompt Service: Version Resolution and Prompt Generation', () => {
  const engineV2 = getPromptBuilder('v2');
  assert.ok(engineV2);
  assert.equal(engineV2.version, '2.0.0');

  const prompt = engineV2.build('Chicken Biryani: ₹220', {
    profile: { name: 'Anitha', dietary_preference: 'veg', total_orders: 4 },
  });
  assert.ok(prompt.includes('VoiceCart AI'));
  assert.ok(prompt.includes('Anitha'));
  assert.ok(prompt.includes('Chicken Biryani: ₹220'));
});

test('PII Masking: Phone Number Redaction', () => {
  const maskedIndian = maskPhone('+919876543210');
  assert.equal(maskedIndian, '+91******3210');

  const maskedLocal = maskPhone('9876543210');
  assert.ok(maskedLocal.includes('******'));
});
