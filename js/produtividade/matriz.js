Produtividade.Matriz = {
    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('matriz-body');
        tbody.innerHTML = '<tr><td colspan="15" class="text-center py-4">Gerando matriz...</td></tr>';

        try {
            const anoAtual = new Date().getFullYear();
            const start = `${anoAtual}-01-01`;
            const end = `${anoAtual}-12-31`;

            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('data_referencia, quantidade, usuarios(nome)')
                .gte('data_referencia', start)
                .lte('data_referencia', end);

            if(error) throw error;

            // Estrutura: { 'Nome': [0, 0, 0... 12] }
            const matriz = {};
            data.forEach(d => {
                const nome = d.usuarios.nome;
                if(!matriz[nome]) matriz[nome] = Array(12).fill(0);
                
                const mes = new Date(d.data_referencia).getMonth(); // 0 = Jan
                matriz[nome][mes] += d.quantidade;
            });

            let html = '';
            Object.keys(matriz).sort().forEach(nome => {
                const vals = matriz[nome];
                const total = vals.reduce((a, b) => a + b, 0);
                
                // Trimestres
                const t1 = vals[0]+vals[1]+vals[2];
                const t2 = vals[3]+vals[4]+vals[5];
                const t3 = vals[6]+vals[7]+vals[8];
                const t4 = vals[9]+vals[10]+vals[11];
                const s1 = t1+t2;
                const s2 = t3+t4;

                html += `<tr class="border-b border-slate-50 hover:bg-slate-50 text-xs">
                    <td class="px-4 py-3 font-bold text-slate-700 bg-slate-50 sticky left-0 border-r">${nome}</td>
                    <td class="px-3 py-3">${vals[0] || '-'}</td>
                    <td class="px-3 py-3">${vals[1] || '-'}</td>
                    <td class="px-3 py-3">${vals[2] || '-'}</td>
                    <td class="px-3 py-3 bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t1}</td>
                    <td class="px-3 py-3">${vals[3] || '-'}</td>
                    <td class="px-3 py-3">${vals[4] || '-'}</td>
                    <td class="px-3 py-3">${vals[5] || '-'}</td>
                    <td class="px-3 py-3 bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t2}</td>
                    <td class="px-3 py-3 bg-indigo-50 text-indigo-700 font-bold border-r border-indigo-100">${s1}</td>
                    <td class="px-3 py-3">${vals[6] || '-'}</td>
                    <td class="px-3 py-3">${vals[7] || '-'}</td>
                    <td class="px-3 py-3">${vals[8] || '-'}</td>
                    <td class="px-3 py-3 bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t3}</td>
                    <td class="px-3 py-3">${vals[9] || '-'}</td>
                    <td class="px-3 py-3">${vals[10] || '-'}</td>
                    <td class="px-3 py-3">${vals[11] || '-'}</td>
                    <td class="px-3 py-3 bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t4}</td>
                    <td class="px-3 py-3 bg-indigo-50 text-indigo-700 font-bold border-r border-indigo-100">${s2}</td>
                    <td class="px-4 py-3 font-black text-slate-800 bg-slate-100">${total}</td>
                </tr>`;
            });
            tbody.innerHTML = html;

        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="20" class="text-center text-red-500">${e.message}</td></tr>`;
        }
    }
};