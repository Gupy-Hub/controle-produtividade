const Matriz = {
    initialized: false,

    init: async function() {
        // Garante que o sistema base carregou
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('matriz-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="20" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando Matriz Anual...</td></tr>';

        // 1. Pega o ANO da data global
        const globalInput = document.getElementById('global-date');
        const dataGlobal = globalInput ? globalInput.value : new Date().toISOString().split('T')[0];
        const ano = parseInt(dataGlobal.split('-')[0]);

        // 2. Define intervalo do ano inteiro
        const inicio = `${ano}-01-01`;
        const fim = `${ano}-12-31`;

        try {
            // 3. Busca dados do ano inteiro
            const { data: prods, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (error) throw error;

            // 4. Processamento dos dados
            const matriz = {};
            const usuariosSet = new Set();

            // Inicializa estrutura para usuários (apenas assistentes ativos ou com produção)
            prods.forEach(p => {
                const u = Sistema.Dados.usuariosCache[p.usuario_id];
                if (u && u.funcao === 'Assistente') {
                    usuariosSet.add(u.nome);
                    if (!matriz[u.nome]) {
                        matriz[u.nome] = Array(12).fill(0); // 12 meses
                    }
                    const mesIndex = new Date(p.data_referencia + 'T12:00:00').getMonth();
                    matriz[u.nome][mesIndex] += (Number(p.quantidade) || 0);
                }
            });

            // Adiciona usuários que não tiveram produção mas estão ativos no cache
            Object.values(Sistema.Dados.usuariosCache).forEach(u => {
                if (u.funcao === 'Assistente' && u.ativo && !matriz[u.nome]) {
                    matriz[u.nome] = Array(12).fill(0);
                }
            });

            this.renderizar(matriz, ano);

        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="20" class="text-center text-red-400">Erro ao carregar matriz.</td></tr>';
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
            
            // Cálculos de Trimestres
            const t1 = meses[0] + meses[1] + meses[2];
            const t2 = meses[3] + meses[4] + meses[5];
            const t3 = meses[6] + meses[7] + meses[8];
            const t4 = meses[9] + meses[10] + meses[11];
            
            // Cálculos de Semestres
            const s1 = t1 + t2;
            const s2 = t3 + t4;
            
            // Total Anual
            const total = s1 + s2;

            // Função auxiliar para formatar zeros como traços leves
            const fmt = (v) => v === 0 ? '<span class="text-slate-200">-</span>' : v.toLocaleString();
            const fmtB = (v) => v === 0 ? '<span class="text-blue-200/50">-</span>' : v.toLocaleString(); // Para colunas azuis
            const fmtD = (v) => v === 0 ? '<span class="text-slate-600">-</span>' : v.toLocaleString(); // Para total escuro

            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-[10px] font-medium text-slate-600">
                <td class="px-4 py-3 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 z-10 whitespace-nowrap">${nome}</td>
                
                <td class="px-2 py-3 text-center">${fmt(meses[0])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[1])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[2])}</td>
                <td class="px-2 py-3 text-center col-tri">${fmtB(t1)}</td>
                
                <td class="px-2 py-3 text-center">${fmt(meses[3])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[4])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[5])}</td>
                <td class="px-2 py-3 text-center col-tri">${fmtB(t2)}</td>
                
                <td class="px-2 py-3 text-center col-sem">${fmtB(s1)}</td>
                
                <td class="px-2 py-3 text-center">${fmt(meses[6])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[7])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[8])}</td>
                <td class="px-2 py-3 text-center col-tri">${fmtB(t3)}</td>
                
                <td class="px-2 py-3 text-center">${fmt(meses[9])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[10])}</td>
                <td class="px-2 py-3 text-center">${fmt(meses[11])}</td>
                <td class="px-2 py-3 text-center col-tri">${fmtB(t4)}</td>
                
                <td class="px-2 py-3 text-center col-sem">${fmtB(s2)}</td>
                
                <td class="px-2 py-3 text-center col-ano text-white">${fmtD(total)}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};