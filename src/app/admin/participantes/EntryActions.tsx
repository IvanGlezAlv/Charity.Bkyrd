"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { PARTICIPATION_HINT, PARTICIPATION_LABEL } from "@/lib/labels";
import type { ActionState } from "@/lib/admin/action-state";
import type { ParticipationStatus } from "@/lib/types";
import { deleteParticipant, setStatus } from "../participantes-actions";

const NEEDS_REASON: ParticipationStatus[] = ["dns", "dnf", "dsq"];

export function StatusForm({ registrationId, status }: { registrationId: string; status: ParticipationStatus }) {
  const [next, setNext] = useState<ParticipationStatus>(status);
  const reasonRequired = NEEDS_REASON.includes(next) || NEEDS_REASON.includes(status);
  return (
    <ActionForm action={setStatus} submit="Cambiar estado">
      <input type="hidden" name="registration_id" value={registrationId} />
      <label className="block">
        <span className="label">Estado</span>
        <select className="field" name="status" value={next} onChange={(e) => setNext(e.target.value as ParticipationStatus)}>
          {(Object.keys(PARTICIPATION_LABEL) as ParticipationStatus[]).map((s) => (
            <option key={s} value={s}>{PARTICIPATION_LABEL[s]} · {PARTICIPATION_HINT[s]}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Motivo {reasonRequired ? "(obligatorio)" : "(opcional)"}</span>
        <input className="field" name="reason" required={reasonRequired} maxLength={500} />
      </label>
    </ActionForm>
  );
}

export function DeleteEntryForm({ participantId }: { participantId: string }) {
  const router = useRouter();
  const action = async (prev: ActionState, form: FormData) => {
    const res = await deleteParticipant(prev, form);
    if (res.ok) router.push("/admin/participantes");
    return res;
  };
  return (
    <ActionForm action={action} submit="Eliminar corredor" danger confirmText="¿Eliminar a este corredor y su inscripción? No se puede deshacer.">
      <input type="hidden" name="participant_id" value={participantId} />
    </ActionForm>
  );
}
