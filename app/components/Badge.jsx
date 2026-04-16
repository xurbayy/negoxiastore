import React from 'react';

export default function Badge({
                                text = "Discord Services",
                                bgColor = "#2C1316",
                                textColor = "#ead4c2",
                                radius = "18px",
                                className = "",
                                size = "md"
                              }) {

  const sizeClasses = {
    sm: "px-3 py-1 text-[11px]",
    md: "px-5 py-[7px] text-[13px]",
    lg: "px-7 py-3 text-[16px]",
    xl: "px-10 py-4 text-[20px]"
  };

  const selectedSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className={`hero-chip-anim bg-brand text-card rounded-full font-medium 
                  font-inter select-none transition-all duration-200 
                  hover:-translate-y-0.5 hover:scale-105 hover:bg-accent2 
                  hover:text-brand cursor-default 
                  ${selectedSize} ${className}`}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: radius
      }}
    >
      <span className="tracking-wide">
        {text}
      </span>
    </div>
  );
}