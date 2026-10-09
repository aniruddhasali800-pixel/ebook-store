import 'server-only';
import { prisma } from '@/lib/db';
import {
  assertComplaintMove,
  CaseStateMachineError,
  type CaseActor,
  type ComplaintStatus,
} from '@/lib/case-rules';

export { assertComplaintMove, canMoveComplaint, CaseStateMachineError } from '@/lib/case-rules';
export { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUSES, type ComplaintStatus } from '@/lib/case-status';

/**
 * The database half of the complaint rules: the transitions and the refusal copy
 * live in `src/lib/case-rules.ts`, this file only writes them.
 */

/** A complaint's status change plus its audit row, in one call. */
export async function moveComplaint(input: {
  complaintId: string;
  to: ComplaintStatus;
  actor: CaseActor;
  staffId?: string;
  reply?: string;
}): Promise<{ from: ComplaintStatus }> {
  const current = await prisma.complaint.findUnique({
    where: { id: input.complaintId },
    select: { id: true, status: true },
  });
  if (!current) throw new CaseStateMachineError('That complaint no longer exists.');
  const from = current.status as ComplaintStatus;
  assertComplaintMove(from, input.to, input.actor);

  const claim = await prisma.complaint.updateMany({
    where: { id: input.complaintId, status: from },
    data: {
      status: input.to,
      ...(input.to === 'ANSWERED' || input.to === 'CLOSED'
        ? { answeredAt: new Date(), answeredById: input.staffId ?? null }
        : {}),
      ...(input.reply ? { reply: input.reply.slice(0, 2000) } : {}),
    },
  });
  if (claim.count !== 1) {
    throw new CaseStateMachineError('Someone else updated this complaint just now. Reload it first.');
  }

  await prisma.caseEvent.create({
    data: {
      kind: 'COMPLAINT',
      complaintId: input.complaintId,
      actorType: input.actor,
      actorId: input.staffId ?? null,
      fromStatus: from,
      toStatus: input.to,
      note: input.reply?.slice(0, 900) ?? null,
    },
  });

  return { from };
}
