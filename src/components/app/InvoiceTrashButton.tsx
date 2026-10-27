import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getCurrentSession, trashPaymentInvoice } from "@/lib/gym/store";
import type { Payment } from "@/lib/gym/types";

export function InvoiceTrashButton({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const session = getCurrentSession();
  if (session?.role === "receptionist" && !session.permissions?.payments) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive"
        aria-label={`Delete invoice ${payment.invoiceNo}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Move invoice to Trash?</DialogTitle>
            <DialogDescription>
              Receipt {payment.invoiceNo} will be hidden from payment history and can be restored
              from Trash. This does not reverse or refund the payment: revenue, the amount paid, and
              member dues stay unchanged. Other receipts sharing this invoice number are unaffected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (trashPaymentInvoice(payment.id)) {
                  toast.success("Invoice moved to Trash; payment retained", {
                    action: {
                      label: "View in Trash",
                      onClick: () => {
                        void navigate({ to: "/trash" });
                      },
                    },
                  });
                  setOpen(false);
                } else
                  toast.error("Invoice could not be moved to Trash. Check your account access.");
              }}
            >
              Move invoice to Trash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
