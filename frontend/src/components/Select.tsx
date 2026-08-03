interface SelectProps {
	label: string;
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
}

export function Select({ label, value, options, onChange }: SelectProps) {
	return (
		<label className="field">
			<span>{label}</span>
			<select value={value} onChange={(event) => onChange(event.target.value)}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}
