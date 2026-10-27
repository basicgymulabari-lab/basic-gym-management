/** Payment records remain valid when their membership term is recoverable in Trash. */
export function MembershipTrashNotice({
  permanentlyRemoved = false,
}: {
  permanentlyRemoved?: boolean;
}) {
  return (
    <span
      className="mt-1 block text-xs text-warning"
      title={`${permanentlyRemoved ? "This membership term was permanently removed from Trash." : "This membership term is in Trash."} The payment and invoice are preserved; deleting a term does not refund money.`}
    >
      {permanentlyRemoved ? "Membership removed" : "Membership in Trash"} · payment retained
    </span>
  );
}
