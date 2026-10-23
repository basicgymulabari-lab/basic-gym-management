/** Payment records remain valid when their membership term is recoverable in Trash. */
export function MembershipTrashNotice() {
  return (
    <span
      className="mt-1 block text-xs text-warning"
      title="This membership term is in Trash. The payment and invoice are preserved; deleting a term does not refund money."
    >
      Membership in Trash · payment retained
    </span>
  );
}
