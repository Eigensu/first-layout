export interface CarouselImage {
    id: string;
    /** The API actually serializes the id as `_id`, not `id` — kept here so callers can fall back to it. */
    _id?: string;
    title?: string;
    subtitle?: string;
    image_url?: string;
    link_url?: string;
    display_order: number;
    active: boolean;
    created_at: string;
    updated_at: string;
}

export interface CarouselResponse {
    images: CarouselImage[];
    total: number;
    page: number;
    page_size: number;
}