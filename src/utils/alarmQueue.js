/** Remove only the current alarm when the user marks its activity complete. */
export function removeAlarmFromQueue(queue, activityId, markCompleted) {
  if (!Array.isArray(queue) || queue.length === 0) return []
  if (markCompleted && activityId !== 'test-alarm') {
    return queue.filter((alarm) => alarm.activity?.id !== activityId)
  }
  return queue.slice(1)
}
