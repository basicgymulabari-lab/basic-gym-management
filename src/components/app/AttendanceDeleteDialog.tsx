import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatShortDate } from "@/lib/gym/calendar";
import { formatTime } from "@/lib/gym/time";
import { deleteAttendanceRecord } from "@/lib/gym/store";
import type { AttendanceRecord } from "@/lib/gym/types";

export function AttendanceDeleteDialog({
  record,
  onOpenChange,
}: {
  record: AttendanceRecord | null;
  onOpenChange: (record: AttendanceRecord | null) => void;
}) {
  const removeRecord = () => {
    if (!record) return;
    const result = deleteAttendanceRecord(record.id);
    if (result === "deleted") {
      toast.success("Attendance check-in moved to Trash");
    } else if (result === "read_only") {
      toast.error("Attendance was not moved because this workspace is read-only");
    } else {
      toast.error("This attendance record was already removed");
    }
    onOpenChange(null);
  };

  const time = record ? new Date(record.checkedInAt) : null;
  const formattedTime = time && Number.isFinite(time.getTime()) ? formatTime(time) : "";

  return (
    <AlertDialog
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open) onOpenChange(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move attendance check-in to Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {record?.memberName}’s check-in for {record && formatShortDate(record.date)}
            {formattedTime ? ` at ${formattedTime}` : ""}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-xs text-muted-foreground">
          This hides the check-in from attendance history. You can restore it later from Trash.
          Membership and payment history are unchanged.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep check-in</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={removeRecord}
          >
            Move to Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
