-- Enable realtime on the notifications table so that postgres_changes
-- subscriptions in the frontend are broadcast when rows are inserted.
-- Without this the ChitraWidget realtime subscription never fired.

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Ensure full row data is broadcast (required for filtered subscriptions)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
