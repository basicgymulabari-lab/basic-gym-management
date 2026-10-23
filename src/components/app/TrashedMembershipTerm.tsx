import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteMembershipTermForever, useGym } from "@/lib/gym/store";
import { membershipPayable, money, paidFor, shortDate, shortDateTime } from "@/lib/gym/selectors";
import type { Membership } from "@/lib/gym/types";

export function TrashedMembershipDetails({ term }: { term: Membership }) {
  const state = useGym();
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const member = state.members.find((item) => item.id === term.memberId);
  const plan = state.plans.find((item) => item.id === term.planId);
  const payments = state.payments.filter((payment) => payment.membershipId === term.id);
  const cur = state.settings.currency;
  const paid = paidFor(state, term.id);
  return (
    <>
      <button
        type="button"
        className="break-words text-left font-medium transition-colors hover:text-gold focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        onClick={() => setOpen(true)}
        aria-label={`View deleted term ${plan?.name ?? "Membership"}`}
      >
        {member?.name ?? "Member"} · {plan?.name ?? "Membership"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Deleted membership term details</DialogTitle>
            <DialogDescription>
              Review the saved term and its linked payments before restoring or permanently removing
              it.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {[
              ["Member", member?.name ?? "Member"],
              ["Phone", member?.phone ?? "—"],
              ["Plan", plan?.name ?? "Membership"],
              ["Period", `${shortDate(term.startDate)} → ${shortDate(term.endDate)}`],
              ["Base price", money(term.price, cur)],
              ["Discount", money(term.discount, cur)],
              ["Joining fee", money(term.joiningFee ?? 0, cur)],
              ["Total payable", money(membershipPayable(term), cur)],
              ["Paid", money(paid, cur)],
              ["Due", money(Math.max(0, membershipPayable(term) - paid), cur)],
              ["Frozen", term.frozen ? "Yes" : "No"],
              ["Created", shortDateTime(term.createdAt)],
              ["Deleted", term.deletedAt ? shortDateTime(term.deletedAt) : "—"],
              ["Deleted by", term.deletedBy ?? "Admin"],
              ["Reason", term.deletionReason ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-2 border-t border-border pt-3 text-sm">
            <h3 className="font-medium">Linked payments ({payments.length})</h3>
            {payments.length === 0 ? (
              <p className="text-muted-foreground">No linked payments.</p>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border border-border p-3">
                  <p className="break-words font-medium">
                    {payment.invoiceNo} · {money(payment.amount, cur)}
                  </p>
                  <p className="text-muted-foreground">
                    {shortDateTime(payment.date)} · {payment.method}
                  </p>
                  <p className="break-words text-muted-foreground">{payment.note}</p>
                  {payment.invoiceDeletedAt && (
                    <p className="text-xs text-warning">
                      {payment.invoicePurgedAt ? "Receipt removed from Trash" : "Receipt in Trash"}{" "}
                      · payment retained
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteTrashedMembershipTerm({ term }: { term: Membership }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  return (
    <>
      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          setConfirmation("");
          setOpen(true);
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete forever
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete membership term forever?</DialogTitle>
            <DialogDescription>
              This removes the term from Trash and prevents restoration. Linked payments and invoice
              records are retained. This does not refund money or change revenue. Type DELETE to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="term-delete-confirmation">Type DELETE</Label>
          <Input
            id="term-delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmation !== "DELETE"}
              onClick={() => {
                if (deleteMembershipTermForever(term.id, confirmation)) {
                  toast.success("Membership term permanently removed from Trash");
                  setOpen(false);
                } else toast.error("The term could not be removed. Check your account access.");
              }}
            >
              Delete forever
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
