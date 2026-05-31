/**
 * Global SweetAlert2 helper — themed to match DerivTerminal dark UI.
 */
import Swal from "sweetalert2";

const base = Swal.mixin({
  background: "#0f1318",
  color: "#e2e8f0",
  confirmButtonColor: "#10b981",
  cancelButtonColor: "#374151",
  customClass: {
    popup: "swal-dt-popup",
    title: "swal-dt-title",
    htmlContainer: "swal-dt-html",
    confirmButton: "swal-dt-btn-confirm",
    cancelButton: "swal-dt-btn-cancel",
    denyButton: "swal-dt-btn-deny",
  },
  buttonsStyling: true,
  showClass: { popup: "swal-dt-show" },
  hideClass: { popup: "swal-dt-hide" },
});

/** Green success toast (top-right, 2.5 s) */
export function swalSuccess(title: string, text?: string) {
  return base.fire({
    icon: "success",
    title,
    text,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    iconColor: "#10b981",
  });
}

/** Red error toast (top-right, 4 s) */
export function swalError(title: string, text?: string) {
  return base.fire({
    icon: "error",
    title,
    text,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 4000,
    timerProgressBar: true,
    iconColor: "#ef4444",
  });
}

/** Yellow warning toast (top-right, 3 s) */
export function swalWarning(title: string, text?: string) {
  return base.fire({
    icon: "warning",
    title,
    text,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    iconColor: "#f59e0b",
  });
}

/** Blue info toast (top-right, 3 s) */
export function swalInfo(title: string, text?: string) {
  return base.fire({
    icon: "info",
    title,
    text,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    iconColor: "#3b82f6",
  });
}

/** Destructive confirm dialog — resolves to true if user confirmed */
export async function swalConfirm(
  title: string,
  text?: string,
  confirmText = "Yes, delete it",
  icon: "warning" | "question" | "error" = "warning"
): Promise<boolean> {
  const result = await base.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#374151",
    reverseButtons: true,
  });
  return result.isConfirmed;
}
