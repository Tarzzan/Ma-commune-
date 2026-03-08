import { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
);

interface VelocityChartProps {
  data: { date: string; count: number }[];
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function VelocityChart({ data }: VelocityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Détruire l'instance précédente si elle existe
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Couleurs adaptées au thème (CSS variables via getComputedStyle)
    const style = getComputedStyle(document.documentElement);
    const primaryColor = style.getPropertyValue("--primary").trim() || "59 130 246";
    const primary = `hsl(${primaryColor})`;

    const labels = data.map((d) => formatLabel(d.date));
    const counts = data.map((d) => d.count);
    const maxVal = Math.max(...counts, 1);

    // Gradient de remplissage
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.35)");
    gradient.addColorStop(1, "rgba(99, 102, 241, 0.0)");

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Commits",
            data: counts,
            borderColor: "rgb(99, 102, 241)",
            backgroundColor: gradient,
            borderWidth: 2,
            pointBackgroundColor: "rgb(99, 102, 241)",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: counts.map((c) => (c > 0 ? 4 : 2)),
            pointHoverRadius: 6,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            titleColor: "#e2e8f0",
            bodyColor: "#94a3b8",
            borderColor: "rgba(99, 102, 241, 0.4)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => {
                const v = item.raw as number;
                return v === 0 ? " Aucun commit" : ` ${v} commit${v > 1 ? "s" : ""}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(148, 163, 184, 0.08)" },
            ticks: {
              color: "rgba(148, 163, 184, 0.7)",
              font: { size: 10 },
              maxRotation: 0,
              // Afficher seulement 7 labels sur 14 pour éviter l'encombrement
              callback: (_val, index) => (index % 2 === 0 ? labels[index] : ""),
            },
            border: { color: "rgba(148, 163, 184, 0.15)" },
          },
          y: {
            min: 0,
            max: maxVal + 1,
            grid: { color: "rgba(148, 163, 184, 0.08)" },
            ticks: {
              color: "rgba(148, 163, 184, 0.7)",
              font: { size: 10 },
              stepSize: 1,
              precision: 0,
            },
            border: { color: "rgba(148, 163, 184, 0.15)" },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div style={{ height: "180px", position: "relative" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
