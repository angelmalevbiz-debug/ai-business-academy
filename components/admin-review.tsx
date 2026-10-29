"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import type { Submission } from "@/lib/domain";

export function AdminReview({
  submission,
  busy,
  review,
  lessonTitle,
}: {
  submission: Submission;
  busy: boolean;
  review: (status: string, feedback: string) => Promise<boolean>;
  lessonTitle?: string;
}) {
  const [feedback, setFeedback] = useState(submission.feedback || "");
  return (
    <form
      className="panel admin-review"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="section-heading">
        <div>
          <p className="review-author">
            {submission.authorName} · версия {submission.revision}
          </p>
          <h3>{lessonTitle || submission.lessonId}</h3>
        </div>
        <span className="tag">
          {
            {
              pending: "Чака преглед",
              reviewed: "Прегледана",
              needs_changes: "За доработка",
            }[submission.status]
          }
        </span>
      </div>
      <p className="preserve-text">{submission.text}</p>
      <label htmlFor={`feedback-${submission.id}`}>Обратна връзка</label>
      <textarea
        id={`feedback-${submission.id}`}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        minLength={10}
        maxLength={3000}
        rows={3}
        placeholder="Посочи какво е изпълнено и какво трябва да се поправи."
      />
      <div className="review-controls">
        <button
          type="button"
          className="button primary"
          disabled={busy || feedback.length < 10}
          onClick={() => {
            void review("reviewed", feedback);
          }}
        >
          <CheckCircle size={18} />
          Завърши прегледа
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || feedback.length < 10}
          onClick={() => {
            void review("needs_changes", feedback);
          }}
        >
          Върни за доработка
        </button>
      </div>
    </form>
  );
}
