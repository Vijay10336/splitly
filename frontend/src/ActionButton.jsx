import React from "react";
import Button from "@mui/material/Button";
export function ActionButton({ className = "", type, ...props }) {
  const classes = className.split(" ");
  const secondary = classes.some((v) =>
    [
      "secondary",
      "ghost",
      "refresh",
      "checkout",
      "sign-out",
      "google-button",
    ].includes(v),
  );
  return (
    <Button
      type={type || "submit"}
      disableElevation
      variant={secondary ? "outlined" : "contained"}
      className={className}
      {...props}
    />
  );
}
