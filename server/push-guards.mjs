/** Compare the complete browser subscription identity before removing a stale device. */
export function sameSubscription(left, right) {
  return Boolean(
    left && right &&
    left.endpoint === right.endpoint &&
    left.keys?.p256dh === right.keys?.p256dh &&
    left.keys?.auth === right.keys?.auth
  )
}

/** A send/retry may update a reminder only while its scheduled payload is unchanged. */
export function sameReminderPayload(left, right) {
  return Boolean(
    left && right &&
    left.id === right.id &&
    left.triggerAt === right.triggerAt &&
    left.title === right.title &&
    left.body === right.body &&
    left.url === right.url &&
    Boolean(left.silent) === Boolean(right.silent)
  )
}
