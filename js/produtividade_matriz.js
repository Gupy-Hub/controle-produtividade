const Matriz = {
    initialized: false,

    init: async function() {
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('matriz-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="20" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando Matriz Anual...</td></tr>';

        const globalInput = document.getElementById('global-date');
        const dataGlobal = globalInput ? globalInput.value : new Date().toISOString().split('T')[0];
        const ano = parseInt(dataGlobal.split('-')[0]);

        const inicio = `${ano}-01-01`;
        const fim = `${ano}-12-31`;

        try {
            const { data: prods, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (error) throw error;

            const matriz = {};
            
            prods.forEach(p => {
                const u = Sistema.Dados.usuariosCache[p.usuario_id];
                if (u && u.funcao === 'Assistente') {
                    if (!matriz[u.nome]) {
                        matriz[u.nome] = Array(12).fill(0); 
                    }
                    const mesIndex = new Date(p.data_referencia + 'T12:00:00').getMonth();
                    matriz[u.nome][mesIndex] += (Number(p.quantidade) || 0);
                }
            });

            // Inclui quem não tem produção mas é assistente ativo
            Object.values(Sistema.Dados.usuariosCache).forEach(u => {
                if (u.funcao === 'Assistente' && u.ativo && !matriz[u.nome]) {
                    matriz[u.nome] = Array(12).fill(0);
                }
            });

            this.renderizar(matriz, ano);

        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="20" class="text-center text-red-400 py-4">Erro ao carregar matriz.</td></tr>';
        }
    },

    renderizar: function(matriz, ano) {
        const tbody = document.getElementById('matriz-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const nomesOrdenados = Object.keys(matriz).sort();

        if (nomesOrdenados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="20" class="text-center py-10 text-slate-400">Nenhum dado em ${ano}.</td></tr>`;
            return;
        }

        let html = '';
        nomesOrdenados.forEach(nome => {
            const meses = matriz[nome];
            
            const t1 = meses[0] + meses[1] + meses[2];
            const t2 = meses[3] + meses[4] + meses[5];
            const t3 = meses[6] + meses[7] + meses[8];
            const t4 = meses[9] + meses[10] + meses[11];
            
            const s1 = t1 + t2;
            const s2 = t3 + t4;
            
            const total = s1 + s2;

            // Formatadores visuais aprimorados
            const fmt = (v) => v === 0 ? '<span class="text-slate-300 font-normal text-xs">-</span>' : `<span class="text-slate-600 font-bold">${v.toLocaleString()}</span>`;
            const fmtB = (v) => v === 0 ? '<span class="text-blue-300/50 font-normal">-</span>' : `<span class="text-blue-800 font-black">${v.toLocaleString()}</span>`;
            const fmtS = (v) => v === 0 ? '<span class="text-indigo-300/50 font-normal">-</span>' : `<span class="text-indigo-800 font-black">${v.toLocaleString()}</span>`;
            const fmtD = (v) => v === 0 ? '<span class="text-slate-400 font-normal">-</span>' : `<span class="text-slate-800 font-black text-sm">${v.toLocaleString()}</span>`;

            // Classes de fundo para colunas de destaque
            const bgTri = "bg-blue-50 border-x border-blue-100";
            const bgSem = "bg-indigo-50 border-r border-indigo-100";
            const bgTotal = "bg-slate-100 font-bold";

            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                <td class="px-4 py-4 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 z-10 whitespace-nowrap shadow-[4px_0_5px_-2px_rgba(0,0,0,0.05)] text-sm">
                    ${nome}
                </td>
                
                <td class="px-3 py-4 text-center">${fmt(meses[0])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[1])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[2])}</td>
                <td class="px-3 py-4 text-center ${bgTri}">${fmtB(t1)}</td>
                
                <td class="px-3 py-4 text-center">${fmt(meses[3])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[4])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[5])}</td>
                <td class="px-3 py-4 text-center ${bgTri}">${fmtB(t2)}</td>
                
                <td class="px-3 py-4 text-center ${bgSem}">${fmtS(s1)}</td>
                
                <td class="px-3 py-4 text-center">${fmt(meses[6])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[7])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[8])}</td>
                <td class="px-3 py-4 text-center ${bgTri}">${fmtB(t3)}</td>
                
                <td class="px-3 py-4 text-center">${fmt(meses[9])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[10])}</td>
                <td class="px-3 py-4 text-center">${fmt(meses[11])}</td>
                <td class="px-3 py-4 text-center ${bgTri}">${fmtB(t4)}</td>
                
                <td class="px-3 py-4 text-center ${bgSem}">${fmtS(s2)}</td>
                
                <td class="px-4 py-4 text-center ${bgTotal}">${fmtD(total)}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};