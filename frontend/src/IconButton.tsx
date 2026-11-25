// Shared workbench icon button and the C3D Reader mark.
export function Mark() {
  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 21L11 12L20 6M11 12L21 17"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="7" cy="21" r="2.3" fill="#4a8ad6" />
      <circle cx="11" cy="12" r="2.3" fill="currentColor" />
      <circle cx="20" cy="6" r="2.3" fill="currentColor" />
      <circle cx="21" cy="17" r="2.3" fill="currentColor" />
    </svg>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.currentTarget.focus();
        onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
