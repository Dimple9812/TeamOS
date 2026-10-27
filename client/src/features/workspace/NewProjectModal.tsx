import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage, useCreateProjectMutation } from "../../app/api";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";

export function NewProjectModal({ workspaceId, open, onClose }: { workspaceId: string; open: boolean; onClose: () => void }) {
  const [create, { isLoading }] = useCreateProjectMutation();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const p = await create({ workspaceId, name: String(f.get("name")), description: String(f.get("description") ?? "") }).unwrap();
      onClose();
      navigate(`/w/${workspaceId}/p/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Name</span>
          <input name="name" required maxLength={80} autoFocus className="field mt-1" placeholder="e.g. Q4 launch" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">What is it for?</span>
          <textarea name="description" maxLength={500} rows={3} className="field mt-1 resize-none" />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isLoading}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
